/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

'use strict';

import * as vscode from 'vscode';
import { SONARLINT_CATEGORY } from '../settings/settings';

interface IExcludeFileOrFolderParameters {
  globPattern: string;
}

export class ExcludeFileOrFolderTool implements vscode.LanguageModelTool<IExcludeFileOrFolderParameters> {
  constructor() {
	  console.log(vscode.lm.tools);
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<IExcludeFileOrFolderParameters>,
    _token: vscode.CancellationToken
  ) {
    const params = options.input;

	  // TODO plug telemetry here

    // Check that the folder is not using Connected Mode
	  // const workspaceFolder = vscode.workspace.getWorkspaceFolder();
    // const isBound = workspaceFolder && vscode.workspace.getConfiguration(SONARLINT_CATEGORY, workspaceFolder).get('connectedMode.project') !== undefined;

    // if (isBound) {
    //   // TODO say that exclusion is not supported in Connected Mode
    // }
    await vscode.workspace.getConfiguration(SONARLINT_CATEGORY).update('analysisExcludesStandalone', params.globPattern, vscode.ConfigurationTarget.Global);

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
      title: 'Exclude files from analysis',
      message: new vscode.MarkdownString(
        `Update SonarQube analysis settings to exclude **${options.input.globPattern}**?`
      )
    };

    return {
      invocationMessage: 'Updating SonarQube analysis configuration...',
      confirmationMessages
    };
  }
}
