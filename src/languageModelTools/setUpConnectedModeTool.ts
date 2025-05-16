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

    if (isBound) {
      this.client.toolCalled(`lm.${SetUpConnectedModeTool.toolName}`, true);
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(`The workspace folder **${workspaceFolder.name}** is already bound to a remote project on SonarQube (Cloud, Server). Nothing more to do.`),
      ]);
    }

    if (ConnectionSettingsService.instance.hasConnectionConfigured()) {
      vscode.commands.executeCommand(Commands.AUTO_BIND_WORKSPACE_FOLDERS);
      this.client.toolCalled(`lm.${SetUpConnectedModeTool.toolName}`, true);
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart('Server connection already configured.'),
        new vscode.LanguageModelTextPart('Initiated auto-binding of workspace folders to remote projects.')
      ]);
    }

    if (!params.isSonarQubeCloud && params.serverUrl) {
      connectToSonarQube(this.context)(params.serverUrl, params.projectKey, false, workspaceFolder?.uri);
    } else if (params.isSonarQubeCloud && params.organizationKey) {
      connectToSonarCloud(this.context)(params.organizationKey, params.projectKey, false, null, workspaceFolder?.uri);
    }

    if (!params.serverUrl && !params.organizationKey) {
      this.client.toolCalled(`lm.${SetUpConnectedModeTool.toolName}`, false);
      throw new Error(`I cannot set up Connected Mode without a server URL or organization key.
        Please provide one of them and try again.`);
    }

    this.client.toolCalled(`lm.${SetUpConnectedModeTool.toolName}`, true);
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
}

