/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import { connectToSonarCloud, connectToSonarQube } from './connectionsetup';
import { SonarLintExtendedLanguageClient } from '../lsp/client';
import { ConnectionSuggestion } from '../lsp/protocol';
import { logToSonarLintOutput } from '../util/logging';
import { code2ProtocolConverter } from '../util/uri';
import { TextEncoder } from 'util';
import * as path from 'path';
import { FileSystemSubscriber } from '../fileSystem/fileSystemSubscriber';
import { FileSystemServiceImpl } from '../fileSystem/fileSystemServiceImpl';

const MAX_FOLDERS_TO_NOTIFY = 1;
const DO_NOT_ASK_ABOUT_CONNECTION_SETUP_FOR_WORKSPACE = 'doNotAskAboutConnectionSetupForWorkspace';

const USE_CONFIGURATION_ACTION = 'Use Configuration';
const NOT_NOW_ACTION = 'Not Now';
const DONT_ASK_AGAIN_ACTION = "Don't Ask Again";

const SOLUTION_FILE_SUFFIX_LENGTH = -4;

export class SharedConnectedModeSettingsService implements FileSystemSubscriber {
  private static _instance: SharedConnectedModeSettingsService;
  public static readonly SHARED_CONNECTED_MODE_CONFIG_FOLDER = '.sonarlint';
  public static readonly SHARED_CONNECTED_MODE_CONFIG_GENERIC_FILE = 'connectedMode.json';
  private readonly solutionFilesByConfigScope: Map<string, string[]> = new Map<string, string[]>();

  static init(
    languageClient: SonarLintExtendedLanguageClient,
    fileSystemService: FileSystemServiceImpl,
    context: vscode.ExtensionContext
  ): void {
    SharedConnectedModeSettingsService._instance = new SharedConnectedModeSettingsService(languageClient, context);
    fileSystemService.subscribe(SharedConnectedModeSettingsService._instance);
  }

  constructor(
    private readonly languageClient: SonarLintExtendedLanguageClient,
    private readonly context: vscode.ExtensionContext
  ) {}

  static get instance(): SharedConnectedModeSettingsService {
    return SharedConnectedModeSettingsService._instance;
  }

  onFile(folderUri: string, fileName: string, fullFileUri: vscode.Uri) {
    if (folderUri && !this.solutionFilesByConfigScope.get(folderUri)) {
      this.solutionFilesByConfigScope.set(folderUri, []);
    }
    if (fileName.endsWith('.sln')) {
      const friendlySolutionName = fileName.slice(0, SOLUTION_FILE_SUFFIX_LENGTH);
      this.solutionFilesByConfigScope.get(folderUri).push(friendlySolutionName);
    }
  }
  didRemoveWorkspaceFolder(workspaceFolderUri: vscode.Uri) {
    this.solutionFilesByConfigScope.set(workspaceFolderUri.toString(), []);
  }

  handleSuggestConnectionNotification(connectedModeSuggestions: {
    [configScopeId: string]: Array<ConnectionSuggestion>;
  }) {
    const configScopeIds = Object.keys(connectedModeSuggestions);
    if (configScopeIds.length > MAX_FOLDERS_TO_NOTIFY) {
      logToSonarLintOutput(`Received connection suggestions for too many folders, skipping`);
    }
    configScopeIds.forEach(configScopeId =>
      this.suggestConnectionForConfigScope(configScopeId, connectedModeSuggestions[configScopeId])
    );
  }

  private async suggestConnectionForConfigScope(configScopeId: string, suggestions: Array<ConnectionSuggestion>) {
    if (this.context.workspaceState.get(DO_NOT_ASK_ABOUT_CONNECTION_SETUP_FOR_WORKSPACE)) {
      // Ignore silently since user asked not to be bothered again
      return;
    }
    const workspaceFolder = tryGetWorkspaceFolder(configScopeId);
    if (workspaceFolder === undefined) {
      logToSonarLintOutput(`Ignoring connection suggestion for unknown folder ${configScopeId}`);
      return;
    }
    if (suggestions.length === 0) {
      logToSonarLintOutput(`Ignoring empty suggestions for ${configScopeId}`);
    } else if (suggestions.length === 1) {
      this.suggestBindSingleOption(suggestions[0], workspaceFolder);
    } else {
      // multiple suggestions for the same config scope
      // deduplicate suggestions first
      const uniqueSuggestions = this.deduplicateSuggestions(suggestions);
      if (uniqueSuggestions.length === 1) {
        this.suggestBindSingleOption(uniqueSuggestions[0], workspaceFolder);
      } else {
        this.suggestBindingMultiOption(uniqueSuggestions, workspaceFolder);
      }
    }
  }

  deduplicateSuggestions(suggestions: Array<ConnectionSuggestion>): Array<ConnectionSuggestion> {
    return Array.from(new Set(suggestions.map(s => JSON.stringify(s.connectionSuggestion)))).map(s => JSON.parse(s));
  }

  private async suggestBindingMultiOption(uniqueSuggestions, workspaceFolder) {
    const message = `Multiple Connected Mode
       configuration files are available to bind folder '${workspaceFolder.name}'
        to a Sonar server. Do you want to use the shared configuration?`;
    const useConfigurationHandler = async () => {
      const quickPickItems: vscode.QuickPickItem[] = uniqueSuggestions.map(s => {
        return {
          label: s.projectKey,
          description: s.organization || s.serverUrl,
          detail: s.organization ? 'SonarQube Cloud' : 'SonarQube Server'
        };
      });
      const selectedConfig = await vscode.window.showQuickPick(quickPickItems, {
        title: `Which project would you like to bind with the folder '${workspaceFolder.name}/'`
      });
      if (selectedConfig && selectedConfig.detail === 'SonarQube Cloud') {
        connectToSonarCloud(this.context)(selectedConfig.description, selectedConfig.label, workspaceFolder.uri);
      } else if (selectedConfig && selectedConfig.detail === 'SonarQube Server') {
        connectToSonarQube(this.context)(selectedConfig.description, selectedConfig.label, workspaceFolder.uri);
      }
    };
    await this.suggestBinding(message, useConfigurationHandler);
  }

  private async suggestBindSingleOption(suggestion, workspaceFolder) {
    const { projectKey, serverUrl, organization } = suggestion.connectionSuggestion;
    const isFromSharedConfiguration = suggestion.isFromSharedConfiguration;
    const serverReference = organization
      ? `of SonarQube Cloud organization '${organization}'`
      : `on SonarQube Server '${serverUrl}'`;
    const message = `A Connected Mode configuration file is available to bind folder '${workspaceFolder.name}'
        to project '${projectKey}' ${serverReference}. Do you want to use this configuration file to bind this project?`;
    const useConfigurationHandler = async () => {
      if (organization) {
        connectToSonarCloud(this.context)(organization, projectKey, isFromSharedConfiguration, workspaceFolder.uri);
      } else {
        connectToSonarQube(this.context)(serverUrl, projectKey, isFromSharedConfiguration, workspaceFolder.uri);
      }
    };
    await this.suggestBinding(message, useConfigurationHandler);
  }

  private async suggestBinding(proposalMessage: string, useConfigurationAction: () => Promise<void>) {
    const actions = [USE_CONFIGURATION_ACTION, NOT_NOW_ACTION, DONT_ASK_AGAIN_ACTION];
    const userAnswer = await vscode.window.showInformationMessage(proposalMessage, ...actions);

    switch (userAnswer) {
      case USE_CONFIGURATION_ACTION:
        await useConfigurationAction();
        break;
      case NOT_NOW_ACTION:
        break;
      case DONT_ASK_AGAIN_ACTION:
        this.context.workspaceState.update(DO_NOT_ASK_ABOUT_CONNECTION_SETUP_FOR_WORKSPACE, true);
        break;
      default:
      // NOP
    }
  }

  async askConfirmationAndCreateSharedConnectedModeSettingsFile(workspaceFolder: vscode.WorkspaceFolder) {
    const SHARE_ACTION = 'Share Configuration';
    const userConfirmation = await vscode.window.showInformationMessage(
      'Share this Connected Mode configuration?',
      {
        modal: true,
        detail:
          'A configuration file will be created in this working directory,' +
          ' making it easier for other team members to configure the binding for the same project.'
      },
      SHARE_ACTION
    );
    if (userConfirmation === SHARE_ACTION) {
      await this.createSharedConnectedModeSettingsFile(workspaceFolder);
    } else {
      return;
    }
  }

  async createSharedConnectedModeSettingsFile(workspaceFolder: vscode.WorkspaceFolder) {
    const configScopeId = code2ProtocolConverter(workspaceFolder.uri);
    const fileContents = await this.languageClient.getSharedConnectedModeConfigFileContent(configScopeId);
    const fileName = await this.computeSharedConnectedModeFileName(workspaceFolder.uri.toString());
    if (!fileName) {
      logToSonarLintOutput('Sharing Connected Mode configuration failed. File name is null');
      vscode.window.showErrorMessage('Failed to create SonarQube for VS Code Connected Mode configuration file.');
      return;
    }
    const destinationUri = vscode.Uri.file(
      path.join(
        workspaceFolder.uri.fsPath,
        SharedConnectedModeSettingsService.SHARED_CONNECTED_MODE_CONFIG_FOLDER,
        fileName
      )
    );
    try {
      await vscode.workspace.fs.writeFile(destinationUri, new TextEncoder().encode(fileContents.jsonFileContent));
      vscode.window.showInformationMessage('SonarQube for VS Code Connected Mode configuration file was created.');
    } catch (e) {
      vscode.window.showErrorMessage('Failed to create SonarQube for VS Code Connected Mode configuration file.');
      logToSonarLintOutput(`Error writing SonarQube for VS Code configuration file: ${e}`);
    }
  }

  async computeSharedConnectedModeFileName(workspaceFolderUri: string): Promise<string> {
    try {
      if (this.solutionFilesByConfigScope.get(workspaceFolderUri)?.length === 0) {
        return SharedConnectedModeSettingsService.SHARED_CONNECTED_MODE_CONFIG_GENERIC_FILE;
      } else if (this.solutionFilesByConfigScope.get(workspaceFolderUri)?.length === 1) {
        return `${this.solutionFilesByConfigScope.get(workspaceFolderUri)[0]}.json`;
      } else {
        const selectedSolutionName = await vscode.window.showQuickPick(
          this.solutionFilesByConfigScope.get(workspaceFolderUri),
          {
            title: 'For which Solution would you like to export SonarQube for VS Code binding configuration?',
            placeHolder:
              'A configuration file corresponding to the selected Solution will be created in this working directory.'
          }
        );
        return selectedSolutionName ? `${selectedSolutionName}.json` : null;
      }
    } catch (error) {
      return null;
    }
  }
}

function tryGetWorkspaceFolder(configScopeId: string) {
  try {
    return vscode.workspace.getWorkspaceFolder(vscode.Uri.parse(configScopeId));
  } catch (notAuri) {
    return undefined;
  }
}
