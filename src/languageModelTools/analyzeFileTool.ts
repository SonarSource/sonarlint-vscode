/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

'use strict';

import * as vscode from 'vscode';
import { SonarLintExtendedLanguageClient } from '../lsp/client';
import { IssueService } from '../issue/issue';

interface IAnalyzeFileParameters {
  filePath: string;
}

export class AnalyzeFileTool implements vscode.LanguageModelTool<IAnalyzeFileParameters> {
  public static readonly toolName = 'sonarqube_analyze_file';
  constructor(readonly client: SonarLintExtendedLanguageClient) {
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<IAnalyzeFileParameters>,
    _token: vscode.CancellationToken
  ) {
    const params = options.input;

    const fileUri = vscode.Uri.file(params.filePath);
    // Open file in the editor
    const textDocument = await vscode.workspace.openTextDocument(fileUri);
    vscode.window.showTextDocument(fileUri, {
      viewColumn: vscode.ViewColumn.Active,
      preserveFocus: true,
      preview: true
    });
    // Analyze the file
    IssueService.instance.analyseOpenFileIgnoringExcludes(false, textDocument);
    // Focus on the SonarQube Findings view
    vscode.commands.executeCommand('SonarQube.Findings.focus');
   
    this.client.lmToolCalled(`lm_${AnalyzeFileTool.toolName}`, true);
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(`SonarQube analysis triggered for file: '${params.filePath}'.
         Detected code quality and security issues will be shown in the PROBLEMS view.`)
    ]);
  }

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<IAnalyzeFileParameters>,
    _token: vscode.CancellationToken
  ) {
    const confirmationMessages = {
      title: 'Analyze File',
      message: new vscode.MarkdownString(
        `Run SonarQube for IDE analysis on **${options.input.filePath}**?`
      )
    };

    return {
      invocationMessage: 'Running SonarQube for IDE local analysis...',
      confirmationMessages
    };
  }
}
