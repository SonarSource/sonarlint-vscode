/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

'use strict';

import * as vscode from 'vscode';
import { AllHotspotsTreeDataProvider } from '../hotspot/hotspotsTreeDataProvider';
import { Diagnostic } from '../lsp/protocol';
import { SONARLINT_CATEGORY } from '../settings/settings';

interface IHotspotCountParameters {
  filePath: string;
}

export class ListPotentialSecurityIssuesTool implements vscode.LanguageModelTool<IHotspotCountParameters> {
  constructor(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.lm.registerTool('sonarqube_list_potential_security_issues', this));
	console.log(vscode.lm.tools);
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<IHotspotCountParameters>,
    _token: vscode.CancellationToken
  ) {
    const params = options.input;
    let fileUri: vscode.Uri;
    if (typeof params.filePath === 'string') {
      fileUri = vscode.Uri.file(params.filePath);
    } else {
      const activeFile = vscode.window.activeTextEditor?.document;
      fileUri = activeFile ? activeFile.uri : null;
    }

	  // TODO plug telemetry here

    // Check that the folder is using Connected Mode
	  const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileUri);
    const isBound = workspaceFolder && vscode.workspace.getConfiguration(SONARLINT_CATEGORY, workspaceFolder).get('connectedMode.project') !== undefined;

    if (!isBound) {
      // TODO suggest calling another tool to bind the workspace
    }
    const hotspotsInFile: Diagnostic[] = AllHotspotsTreeDataProvider.instance.getAllHotspotsForFile(fileUri.toString());

    const results: vscode.LanguageModelTextPart[] = [];
    for (const h of hotspotsInFile) {
      results.push(
        new vscode.LanguageModelTextPart(`There is a potential security issue with message ${h.message} on line ${h.range.start.line}`)
      );
    }

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(`There are ${hotspotsInFile.length} potential security issues in the active file:`),
      ...results
    ]);
  }

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<IHotspotCountParameters>,
    _token: vscode.CancellationToken
  ) {
    const confirmationMessages = {
      title: 'Retrieve detected Security Hotspots for a file',
      message: new vscode.MarkdownString(
        `Retrieve the detected Security Hotspots for the file **${options.input.filePath}**?`
      )
    };

    return {
      invocationMessage: 'Fetching Security Hotspots for the file...',
      confirmationMessages
    };
  }
}
