/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import { SonarLintExtendedLanguageClient } from '../lsp/client';

export async function introduceSonarQubeRulesFile(languageClient: SonarLintExtendedLanguageClient): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder found. Please open a folder first.');
    return;
  }

  const cursorRulesUri = vscode.Uri.joinPath(workspaceFolder.uri, '.cursor', 'rules');
  const rulesFileUri = vscode.Uri.joinPath(cursorRulesUri, 'sonarqube_rules.mdc');

  try {
    try {
      await vscode.workspace.fs.stat(cursorRulesUri);
    } catch {
      await vscode.workspace.fs.createDirectory(cursorRulesUri);
    }

    try {
      await vscode.workspace.fs.stat(rulesFileUri);
      const overwrite = await vscode.window.showWarningMessage(
        'The sonarqube_rules.mdc file already exists. Do you want to overwrite it?',
        'Overwrite'
      );
      if (overwrite !== 'Overwrite') {
        return;
      }
    } catch {
      // file does not exist, proceed to create it
    }

    const rulesFileResponse = await languageClient.getMCPRulesFileContent('cursor');

    await vscode.workspace.fs.writeFile(rulesFileUri, Buffer.from(rulesFileResponse.content, 'utf8'));

    const document = await vscode.workspace.openTextDocument(rulesFileUri);
    await vscode.window.showTextDocument(document);

    vscode.window.showInformationMessage('SonarQube MCP Server rules file created.');
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to create rules file: ${error.message}`);
  }
}

export async function openSonarQubeRulesFile(): Promise<void> {
  try {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('No workspace folder found. Please open a folder first.');
      return;
    }

    const rulesFileUri = getCursorRulesFileUri(workspaceFolder.uri);

    try {
      await vscode.workspace.fs.stat(rulesFileUri);
      const document = await vscode.workspace.openTextDocument(rulesFileUri);
      await vscode.window.showTextDocument(document);
    } catch {
      const action = await vscode.window.showWarningMessage(
        'SonarQube rules file not found. Would you like to create one?',
        'Create Rules File'
      );

      if (action === 'Create Rules File') {
        vscode.commands.executeCommand('SonarLint.IntroduceSonarQubeRulesFile');
      }
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Error opening SonarQube rules file: ${error.message}`);
  }
}

export async function isSonarQubeRulesFileConfigured(): Promise<boolean> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return false;
  }

  const rulesFileUri = getCursorRulesFileUri(workspaceFolder.uri);
  try {
    await vscode.workspace.fs.stat(rulesFileUri);
    return true;
  } catch {
    return false;
  }
}

function getCursorRulesFileUri(workspaceFolderUri: vscode.Uri): vscode.Uri {
  return vscode.Uri.joinPath(workspaceFolderUri, '.cursor', 'rules', 'sonarqube_rules.mdc');
}
