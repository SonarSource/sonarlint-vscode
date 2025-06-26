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
import { SonarLintExtendedLanguageClient } from '../lsp/client';
import { BindingService } from '../connected/binding';

interface IHotspotCountParameters {
  filePath: string;
}

export class ListPotentialSecurityIssuesTool implements vscode.LanguageModelTool<IHotspotCountParameters> {
  public static readonly toolName = 'sonarqube_list_potential_security_issues';
  constructor(readonly client: SonarLintExtendedLanguageClient) {}
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

    // Check that the folder is using Connected Mode
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileUri);
    const isBound = workspaceFolder && BindingService.instance.isBound(workspaceFolder);
    const results: vscode.LanguageModelTextPart[] = [];
    if (!isBound) {
      this.client.lmToolCalled(`lm_${ListPotentialSecurityIssuesTool.toolName}`, false);
      vscode.lm.invokeTool('sonarqube_setUpConnectedMode', {
        toolInvocationToken: options.toolInvocationToken,
        input: {
          workspaceFolder: workspaceFolder?.uri.toString(),
          isSonarQubeCloud: true,
          organizationKey: 'exampleOrg',
          projectKey: 'exampleProject'
        }
      });
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          `The workspace folder is not bound to a remote project on SonarQube (Cloud, Server).
         SonarQube for IDE needs to be in Connected Mode to retrieve the detected Security Hotspots.`
        ),
        new vscode.LanguageModelTextPart('I have initiated the binding process for you.'),
      ]);
    }
    const hotspotsInFile: Diagnostic[] = AllHotspotsTreeDataProvider.instance.getAllHotspotsForFile(fileUri.toString());

    for (const h of hotspotsInFile) {
      results.push(
        new vscode.LanguageModelTextPart(
          `There is a potential security issue with message ${h.message} on line ${h.range.start.line}`
        )
      );
    }

    this.client.lmToolCalled(`lm_${ListPotentialSecurityIssuesTool.toolName}`, true);
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(
        `There are ${hotspotsInFile.length} potential security issues in the active file:`
      ),
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
