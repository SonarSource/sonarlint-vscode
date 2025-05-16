/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

'use strict';

import * as vscode from 'vscode';
import { SONARLINT_CATEGORY } from '../settings/settings';
import { connectToSonarCloud, connectToSonarQube } from '../connected/connectionsetup';


interface ISetUpConnectedModeParameters {
  isSonarQubeCloud: boolean;
  workspaceFolder?: string;
  serverUrl?: string;
  organizationKey?: string;
  projectKey?: string;
}

export class SetUpConnectedModeTool implements vscode.LanguageModelTool<ISetUpConnectedModeParameters> {
  constructor(private readonly context: vscode.ExtensionContext) {
  }
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ISetUpConnectedModeParameters>,
    _token: vscode.CancellationToken
  ) {
    const params = options.input;
    const workspaceFolderUri = params.workspaceFolder ? vscode.Uri.parse(params.workspaceFolder) : vscode.workspace.workspaceFolders?.[0].uri;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(workspaceFolderUri);

    if (!params.isSonarQubeCloud && params.serverUrl) {
      connectToSonarQube(this.context)(params.serverUrl, params.projectKey, false, workspaceFolder?.uri);
    } else if (params.isSonarQubeCloud && params.organizationKey) {
      connectToSonarCloud(this.context)(params.organizationKey, params.projectKey, false, null, workspaceFolder?.uri);
    }

    if (!params.serverUrl && !params.organizationKey) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart('I cannot set up Connected Mode without a server URL or organization key.'),
        new vscode.LanguageModelTextPart('Please provide one of them and try again.'),
      ]);
    }

    // TODO plug telemetry here

    // Check that the folder is not using Connected Mode
    const isBound = workspaceFolder && vscode.workspace.getConfiguration(SONARLINT_CATEGORY, workspaceFolder).get('connectedMode.project') !== undefined;

    // if (isBound) {
    //   return new vscode.LanguageModelToolResult([
    //     new vscode.LanguageModelTextPart(`The workspace folder **${workspaceFolder.name}** is already bound to a remote project on SonarQube (Cloud, Server).`)
    //   ]);
    // }

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

