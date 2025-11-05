/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import { SonarLintExtendedLanguageClient } from '../lsp/client';
import { Commands } from '../util/commands';
import { getCurrentIdeWithMCPSupport, IDE } from './aiAgentUtils';

const SONARQUBE_MCP_INSTRUCTIONS_FILE_MDC = 'sonarqube_mcp_instructions.mdc';
const SONARQUBE_MCP_INSTRUCTIONS_FILE_MD = 'sonarqube_mcp.instructions.md';

export async function introduceSonarQubeRulesFile(languageClient: SonarLintExtendedLanguageClient): Promise<void> {
  const currentIDE = getCurrentIdeWithMCPSupport();
  if (!currentIDE) {
    vscode.window.showErrorMessage('Current IDE does not support MCP Server configuration.');
    return;
  }

  const userConfirmed = await askUserForConfirmation(currentIDE);
  if (!userConfirmed) {
    return;
  }

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder found. Please open a folder first.');
    return;
  }

  const rulesDirectoryUri = getRulesDirectoryUri(workspaceFolder.uri, currentIDE);
  const rulesFileUri = getRulesFileUri(workspaceFolder.uri, currentIDE);
  const fileName = getFileName(currentIDE);

  try {
    try {
      await vscode.workspace.fs.stat(rulesDirectoryUri);
    } catch {
      await vscode.workspace.fs.createDirectory(rulesDirectoryUri);
    }

    try {
      await vscode.workspace.fs.stat(rulesFileUri);
      const overwrite = await vscode.window.showWarningMessage(
        `The ${fileName} file already exists. Do you want to overwrite it?`,
        'Overwrite'
      );
      if (overwrite !== 'Overwrite') {
        return;
      }
    } catch {
      // file does not exist, proceed to create it
    }

    const rulesFileResponse = await languageClient.getMCPRulesFileContent(currentIDE.toLowerCase());

    await vscode.workspace.fs.writeFile(rulesFileUri, Buffer.from(rulesFileResponse.content, 'utf8'));

    const document = await vscode.workspace.openTextDocument(rulesFileUri);
    await vscode.window.showTextDocument(document);

    vscode.window.showInformationMessage('SonarQube MCP Server rules file created.');
    // Refresh the AI agents configuration tree
    vscode.commands.executeCommand(Commands.REFRESH_AI_AGENTS_CONFIGURATION);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to create rules file: ${error.message}`);
  }
}

export async function openSonarQubeRulesFile(): Promise<void> {
  try {
    const currentIDE = getCurrentIdeWithMCPSupport();
    if (!currentIDE) {
      vscode.window.showErrorMessage('Current IDE does not support MCP Server configuration.');
      return;
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('No workspace folder found. Please open a folder first.');
      return;
    }

    const rulesFileUri = getRulesFileUri(workspaceFolder.uri, currentIDE);

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
  const currentIDE = getCurrentIdeWithMCPSupport();
  if (!currentIDE) {
    return false;
  }

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return false;
  }

  const rulesFileUri = getRulesFileUri(workspaceFolder.uri, currentIDE);
  try {
    await vscode.workspace.fs.stat(rulesFileUri);
    return true;
  } catch {
    return false;
  }
}

function getRulesDirectoryUri(workspaceFolderUri: vscode.Uri, ide: IDE): vscode.Uri {
  switch (ide) {
    case IDE.CURSOR:
      return vscode.Uri.joinPath(workspaceFolderUri, '.cursor', 'rules');
    case IDE.WINDSURF:
      return vscode.Uri.joinPath(workspaceFolderUri, '.windsurf', 'rules');
    case IDE.VSCODE:
    case IDE.VSCODE_INSIDERS:
      return vscode.Uri.joinPath(workspaceFolderUri, '.github', 'instructions');
    default:
      throw new Error(`Unsupported IDE: ${ide}`);
  }
}

function getRulesFileUri(workspaceFolderUri: vscode.Uri, ide: IDE): vscode.Uri {
  const directory = getRulesDirectoryUri(workspaceFolderUri, ide);
  const fileName = getFileName(ide);
  return vscode.Uri.joinPath(directory, fileName);
}

function getFileName(ide: IDE): string {
  switch (ide) {
    case IDE.CURSOR:
    case IDE.WINDSURF:
      return SONARQUBE_MCP_INSTRUCTIONS_FILE_MDC;
    case IDE.VSCODE:
    case IDE.VSCODE_INSIDERS:
      return SONARQUBE_MCP_INSTRUCTIONS_FILE_MD;
    default:
      throw new Error(`Unsupported IDE: ${ide}`);
  }
}

async function askUserForConfirmation(ide: IDE): Promise<boolean> {
  const fileName = getFileName(ide);
  const result = await vscode.window.showInformationMessage(
    "Would you like to create a SonarQube MCP Server instructions for AI agents?",
    { modal: true, detail: `This will create a '${fileName}' file in your workspace folder.` },
    'OK'
  );
  return result === 'OK';
}
