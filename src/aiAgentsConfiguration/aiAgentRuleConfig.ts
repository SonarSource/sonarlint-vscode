/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import { SonarLintExtendedLanguageClient } from '../lsp/client';
import { Commands } from '../util/commands';
import { getCurrentIntegrationTargetWithMCPSupport, INTEGRATION_TARGET } from './aiAgentUtils';

const SONARQUBE_MCP_INSTRUCTIONS_FILE_MDC = 'sonarqube_mcp_instructions.mdc';
const SONARQUBE_MCP_INSTRUCTIONS_FILE_MD = 'sonarqube_mcp.instructions.md';

export async function introduceSonarQubeRulesFile(languageClient: SonarLintExtendedLanguageClient): Promise<void> {
  const currentAgent = getCurrentIntegrationTargetWithMCPSupport();
  if (!currentAgent) {
    vscode.window.showErrorMessage('Current agent does not support MCP Server configuration.');
    return;
  }

  const userConfirmed = await askUserForConfirmation(currentAgent);
  if (!userConfirmed) {
    return;
  }

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder found. Please open a folder first.');
    return;
  }

  const rulesDirectoryUri = getRulesDirectoryUri(workspaceFolder.uri, currentAgent);
  const rulesFileUri = getRulesFileUri(workspaceFolder.uri, currentAgent);
  const fileName = getFileName(currentAgent);

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

    const rulesFileResponse = await languageClient.getMCPRulesFileContent(currentAgent.toLowerCase());

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

export async function openSonarQubeRulesFile(offerCreation = true): Promise<void> {
  try {
    const currentAgent = getCurrentIntegrationTargetWithMCPSupport();
    if (!currentAgent) {
      vscode.window.showErrorMessage('Current agent does not support MCP Server configuration.');
      return;
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('No workspace folder found. Please open a folder first.');
      return;
    }

    const rulesFileUri = getRulesFileUri(workspaceFolder.uri, currentAgent);

    try {
      await vscode.workspace.fs.stat(rulesFileUri);
    } catch {
      if (!offerCreation) {
        return;
      }
      const action = await vscode.window.showWarningMessage(
        'SonarQube rules file not found. Would you like to create one?',
        'Create Rules File'
      );

      if (action === 'Create Rules File') {
        vscode.commands.executeCommand('SonarLint.IntroduceSonarQubeRulesFile');
      }
      return;
    }

    const document = await vscode.workspace.openTextDocument(rulesFileUri);
    await vscode.window.showTextDocument(document);
  } catch (error) {
    vscode.window.showErrorMessage(`Error opening SonarQube rules file: ${error.message}`);
  }
}

export async function isSonarQubeRulesFileConfigured(): Promise<boolean> {
  const currentAgent = getCurrentIntegrationTargetWithMCPSupport();
  if (!currentAgent) {
    return false;
  }

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return false;
  }

  const rulesFileUri = getRulesFileUri(workspaceFolder.uri, currentAgent);
  try {
    await vscode.workspace.fs.stat(rulesFileUri);
    return true;
  } catch {
    return false;
  }
}

function getRulesDirectoryUri(workspaceFolderUri: vscode.Uri, agent: INTEGRATION_TARGET): vscode.Uri {
  switch (agent) {
    case INTEGRATION_TARGET.CURSOR:
      return vscode.Uri.joinPath(workspaceFolderUri, '.cursor', 'rules');
    case INTEGRATION_TARGET.WINDSURF:
      return vscode.Uri.joinPath(workspaceFolderUri, '.windsurf', 'rules');
    case INTEGRATION_TARGET.KIRO:
      return vscode.Uri.joinPath(workspaceFolderUri, '.kiro', 'steering');
    case INTEGRATION_TARGET.GITHUB_COPILOT:
      return vscode.Uri.joinPath(workspaceFolderUri, '.github', 'instructions');
    default:
      throw new Error(`Unsupported agent: ${agent}`);
  }
}

function getRulesFileUri(workspaceFolderUri: vscode.Uri, agent: INTEGRATION_TARGET): vscode.Uri {
  const directory = getRulesDirectoryUri(workspaceFolderUri, agent);
  const fileName = getFileName(agent);
  return vscode.Uri.joinPath(directory, fileName);
}

function getFileName(agent: INTEGRATION_TARGET): string {
  switch (agent) {
    case INTEGRATION_TARGET.CURSOR:
    case INTEGRATION_TARGET.WINDSURF:
      return SONARQUBE_MCP_INSTRUCTIONS_FILE_MDC;
    case INTEGRATION_TARGET.KIRO:
    case INTEGRATION_TARGET.GITHUB_COPILOT:
      return SONARQUBE_MCP_INSTRUCTIONS_FILE_MD;
    default:
      throw new Error(`Unsupported agent: ${agent}`);
  }
}

async function askUserForConfirmation(agent: INTEGRATION_TARGET): Promise<boolean> {
  const fileName = getFileName(agent);
  const result = await vscode.window.showInformationMessage(
    'Would you like to create a SonarQube MCP Server instructions for AI agents?',
    { modal: true, detail: `This will create a '${fileName}' file in your workspace folder.` },
    'OK'
  );
  return result === 'OK';
}
