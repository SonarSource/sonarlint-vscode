/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

'use strict';

import * as vscode from 'vscode';
import { connectToSonarCloud, connectToSonarQube } from '../connected/connectionsetup';
import { SonarLintExtendedLanguageClient } from '../lsp/client';
import { ConnectionSettingsService } from '../settings/connectionsettings';
import { Commands } from '../util/commands';
import { BindingService } from '../connected/binding';
import { ConnectionSuggestion } from '../lsp/protocol';
import { sonarCloudRegionToLabel } from '../util/util';
import { SharedConnectedModeSettingsService } from '../connected/sharedConnectedModeSettingsService';
import { deduplicateSuggestions } from '../util/connectionSuggestionUtils';


interface ISetUpConnectedModeParameters {
  isSonarQubeCloud: boolean;
  workspaceFolder?: string;
  serverUrl?: string;
  organizationKey?: string;
  projectKey?: string;
}

export class SetUpConnectedModeTool implements vscode.LanguageModelTool<ISetUpConnectedModeParameters> {
  public static readonly toolName = 'sonarqube_setUpConnectedMode';
  
  constructor(private readonly context: vscode.ExtensionContext, readonly client: SonarLintExtendedLanguageClient) {
  }
  
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ISetUpConnectedModeParameters>,
    _token: vscode.CancellationToken
  ) {
    const params = options.input;
    const workspaceFolderUri = params.workspaceFolder ? vscode.Uri.parse(params.workspaceFolder) : vscode.workspace.workspaceFolders?.[0].uri;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(workspaceFolderUri);

    // Check that the folder is not using Connected Mode
    const isBound = workspaceFolder && BindingService.instance.isBound(workspaceFolder);

    // Folder is already bound; nothing to do.
    if (isBound) {
      this.client.lmToolCalled(`lm_${SetUpConnectedModeTool.toolName}`, true);
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(`The workspace folder **${workspaceFolder.name}** is already bound to a remote project on SonarQube (Cloud, Server). Nothing more to do.`),
      ]);
    }

    // Connection already exists; Auto-binding flow can be initiated
    if (ConnectionSettingsService.instance.hasConnectionConfigured()) {
      vscode.commands.executeCommand(Commands.AUTO_BIND_WORKSPACE_FOLDERS);
      this.client.lmToolCalled(`lm_${SetUpConnectedModeTool.toolName}`, true);
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart('Server connection already configured.'),
        new vscode.LanguageModelTextPart('Initiated auto-binding of workspace folders to remote projects.'),
      ]);
    }

    // Neither connection nor binding exist; Get connection suggestions from the server
    const suggestions = await this.client.getConnectionSuggestions(workspaceFolderUri.toString());
    // If at least one suggestion found, use that
    if (suggestions.connectionSuggestions.length > 0) {
      this.setUpConnectedModeUsingSuggestions(suggestions.connectionSuggestions, workspaceFolder);
    } else {
      // If no suggestions found, rely on user input
      if (!params.isSonarQubeCloud && params.serverUrl) {
        connectToSonarQube(this.context)(params.serverUrl, params.projectKey, false, workspaceFolder?.uri);
      } else if (params.isSonarQubeCloud && params.organizationKey) {
        connectToSonarCloud(this.context)(params.organizationKey, params.projectKey, false, null, workspaceFolder?.uri);
      }
  
      if (!params.serverUrl && !params.organizationKey) {
        this.client.lmToolCalled(`lm_${SetUpConnectedModeTool.toolName}`, false);
        throw new Error(`I cannot set up Connected Mode without a server URL or organization key.
          Please provide one of them and try again.`);
      }
    }    

    this.client.lmToolCalled(`lm_${SetUpConnectedModeTool.toolName}`, true);
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart('Connected Mode setup started...'),
      new vscode.LanguageModelTextPart('Please follow the instructions on the screen.'),
    ]);
  }

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<ISetUpConnectedModeParameters>,
    _token: vscode.CancellationToken
  ) {
    const confirmationMessages = {
      title: 'Set up Connected Mode',
      message: new vscode.MarkdownString(
        `Set up SonarQube Connected Mode for '**${options.input.workspaceFolder}**' workspace folder?`
      )
    };

    return {
      invocationMessage: 'Computing Connection suggestions...',
      confirmationMessages
    };
  }

  async setUpConnectedModeUsingSuggestions(connectionSuggestions: ConnectionSuggestion[], workspaceFolder?: vscode.WorkspaceFolder) {
    if (connectionSuggestions.length === 1) {
      const suggestion = connectionSuggestions[0].connectionSuggestion;
      if (suggestion.organization) {
        connectToSonarCloud(this.context)(suggestion.organization, suggestion.projectKey, connectionSuggestions[0].isFromSharedConfiguration, sonarCloudRegionToLabel(suggestion.region), workspaceFolder.uri);
      } else {
        connectToSonarQube(this.context)(suggestion.serverUrl, suggestion.projectKey, connectionSuggestions[0].isFromSharedConfiguration, workspaceFolder.uri);
      }
    } else {
      // multiple suggestions for the same config scope
      // deduplicate suggestions first
      const uniqueSuggestions = deduplicateSuggestions(connectionSuggestions);
      if (uniqueSuggestions.length === 1) {
        this.setUpConnectedModeUsingSuggestions([uniqueSuggestions[0]], workspaceFolder);
      } else {
        SharedConnectedModeSettingsService.instance.severalSharedConfigPoposalHandler(uniqueSuggestions, workspaceFolder)();
      }
    }
  }
}

