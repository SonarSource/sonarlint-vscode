/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

'use strict';

import * as vscode from 'vscode';
import { SONARLINT_CATEGORY } from '../settings/settings';
import { SonarLintExtendedLanguageClient } from '../lsp/client';
import { BindingService } from '../connected/binding';

interface IExcludeFileOrFolderParameters {
  globPattern: string;
}

export class ExcludeFileOrFolderTool implements vscode.LanguageModelTool<IExcludeFileOrFolderParameters> {
  public static readonly toolName = 'sonarqube_excludeFilesOrFoldersFromAnalysis';
  constructor(readonly client: SonarLintExtendedLanguageClient) {
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<IExcludeFileOrFolderParameters>,
    _token: vscode.CancellationToken
  ) {
    const params = options.input;

    // Check that the folder is not using Connected Mode
    const currentlyActiveEditor = vscode.window.activeTextEditor;
	  const workspaceFolder = currentlyActiveEditor ? vscode.workspace.getWorkspaceFolder(currentlyActiveEditor.document.uri) : undefined;
    const isBound = workspaceFolder && BindingService.instance.isBound(workspaceFolder);

    if (isBound) {
      this.client.lmToolCalled(`lm_${ExcludeFileOrFolderTool.toolName}`, false);
      throw new Error(`The workspace folder **${workspaceFolder.name}** is bound to a remote project on SonarQube (Cloud, Server).
         Locally configured exclusions will not make a difference.`);
    }
    await vscode.workspace.getConfiguration(SONARLINT_CATEGORY).update('analysisExcludesStandalone', params.globPattern, vscode.ConfigurationTarget.Global);

    this.client.lmToolCalled(`lm_${ExcludeFileOrFolderTool.toolName}`, true);
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(`SonarQube analysis configuration updated to exclude files matching the pattern: **${params.globPattern}**.
         Note that this change will only apply in case the folder is not bound to a remote project on SonarQube (Cloud, Server).`),
      new vscode.LanguageModelTextPart('You can check the configured local exclusions in `SonarLint.analysisExcludesStandalone` setting.'),
    ]);
  }

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<IExcludeFileOrFolderParameters>,
    _token: vscode.CancellationToken
  ) {
    const confirmationMessages = {
      title: 'Exclude files from local analysis',
      message: new vscode.MarkdownString(
        `Update SonarQube for IDE analysis settings to exclude **${options.input.globPattern}**?`
      )
    };

    return {
      invocationMessage: 'Updating SonarQube for IDE local analysis configuration...',
      confirmationMessages
    };
  }
}
