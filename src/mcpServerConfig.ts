/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { logToSonarLintOutput } from './util/logging';
import { Connection } from './connected/connections';
import { ConnectionSettingsService } from './settings/connectionsettings';
import { SonarLintExtendedLanguageClient } from './lsp/client';
import * as os from 'node:os';
import { getVSCodeSettingsBaseDir } from './util/util';

interface MCPServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

interface MCPConfigurationOthers {
  mcpServers: Record<string, MCPServerConfig>;
}

interface MCPConfigurationVSCode {
  servers: Record<string, MCPServerConfig>;
}

enum IDE {
  VSCODE = 'vscode',
  CURSOR = 'cursor',
  WINDSURF = 'windsurf',
  VSCODE_INSIDERS = 'vscode-insiders'
}

function isCopilotInstalledAndActive(): boolean {
  const copilotExtension = vscode.extensions.getExtension('GitHub.copilot');
  return copilotExtension?.isActive;
}

export function getCurrentAgentSupportedIDE(): IDE {
  if (vscode.env.appName.toLowerCase().includes('cursor')) {
    return IDE.CURSOR;
  } else if (vscode.env.appName.toLowerCase().includes('windsurf')) {
    return IDE.WINDSURF;
  } else if (vscode.env.appName.toLowerCase().includes('insiders') && isCopilotInstalledAndActive()) {
    return IDE.VSCODE_INSIDERS;
  } else if (vscode.env.appName.toLowerCase().includes('visual studio code') && isCopilotInstalledAndActive()) {
    return IDE.VSCODE;
  }
  return undefined;
}

function getMCPConfigPath(): string {
  const currentIDE = getCurrentAgentSupportedIDE();
  switch (currentIDE) {
    case IDE.CURSOR:
      return path.join(os.homedir(), '.cursor', 'mcp.json');
    case IDE.WINDSURF:
      return path.join(os.homedir(), '.codeium', 'windsurf', 'mcp_config.json');
    case IDE.VSCODE_INSIDERS:
      return path.join(getVSCodeSettingsBaseDir(), 'Code - Insiders', 'User', 'mcp.json');
    case IDE.VSCODE:
      return path.join(getVSCodeSettingsBaseDir(), 'Code', 'User', 'mcp.json');
    default:
      throw new Error(`Unsupported IDE: ${currentIDE}`);
  }
}

function readMCPConfig(configPath: string): MCPConfigurationOthers | MCPConfigurationVSCode {
  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(content);
    }
  } catch (error) {
    logToSonarLintOutput(`Error reading MCP config: ${error.message}`);
  }

  const currentIDE = getCurrentAgentSupportedIDE();
  return currentIDE === 'vscode' || currentIDE === 'vscode-insiders'
    ? {
        servers: {}
      }
    : {
        mcpServers: {}
      };
}

function writeMCPConfig(configPath: string, config: MCPConfigurationOthers | MCPConfigurationVSCode): void {
  try {
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    const content = JSON.stringify(config, null, 2);
    fs.writeFileSync(configPath, content, 'utf8');

    logToSonarLintOutput(`MCP configuration updated: ${configPath}`);
  } catch (error) {
    logToSonarLintOutput(`Error writing MCP config: ${error.message}`);
    throw error;
  }
}

export async function configureMCPServer(
  connection: Connection,
  languageClient: SonarLintExtendedLanguageClient
): Promise<void> {
  try {
    const configPath = getMCPConfigPath();
    const config = readMCPConfig(configPath);
    const connectionDetails = await ConnectionSettingsService.instance.getTokenForConnection(connection);

    if (!connectionDetails.token) {
      const proceed = await vscode.window.showWarningMessage(
        `The SonarQube connection "${connection.label}" doesn't have a token configured. The MCP server will be created but may not function properly without a valid token.`,
        'Proceed Anyway',
        'Cancel'
      );

      if (proceed !== 'Proceed Anyway') {
        return;
      }
    }

    const sonarQubeMCPConfig = await languageClient.getMCPServerConfiguration(connection.id, connectionDetails.token);

    const currentIDE = getCurrentAgentSupportedIDE();
    if (currentIDE === IDE.VSCODE || currentIDE === IDE.VSCODE_INSIDERS) {
      (config as MCPConfigurationVSCode).servers.sonarqube = JSON.parse(sonarQubeMCPConfig.jsonConfiguration);
    } else {
      (config as MCPConfigurationOthers).mcpServers.sonarqube = JSON.parse(sonarQubeMCPConfig.jsonConfiguration);
    }

    writeMCPConfig(configPath, config);

    openMCPServersListIfCursor();

    const openFile = await vscode.window.showInformationMessage(
      `SonarQube MCP server configured for "${connection.label}"\n\nConfiguration saved to: ${configPath}`,
      'Open Configuration File'
    );

    if (openFile === 'Open Configuration File') {
      const uri = vscode.Uri.file(configPath);
      await vscode.window.showTextDocument(uri);
    }

    logToSonarLintOutput(`SonarQube MCP server configured successfully for connection: ${connection.label}`);
  } catch (error) {
    const errorMessage = `Failed to configure SonarQube MCP server for "${connection.label}": ${error.message}`;
    vscode.window.showErrorMessage(errorMessage);
    logToSonarLintOutput(errorMessage);
    throw error;
  }
}

function openMCPServersListIfCursor() {
  const currentIDE = getCurrentAgentSupportedIDE();
  if (currentIDE === IDE.CURSOR) {
    vscode.commands.executeCommand('workbench.action.openMCPSettings');
  }
}

export function onEmbeddedServerStarted(port: number): void {
  // need to get MCP config and replace the SONARQUBE_IDE_PORT env variable with the new port
  const currentIDE = getCurrentAgentSupportedIDE();
  const configPath = getMCPConfigPath();
  const config = readMCPConfig(configPath);
  if (currentIDE === IDE.VSCODE || currentIDE === IDE.VSCODE_INSIDERS) {
    (config as MCPConfigurationVSCode).servers.sonarqube.env.SONARQUBE_IDE_PORT = port.toString();
  } else {
    (config as MCPConfigurationOthers).mcpServers.sonarqube.env.SONARQUBE_IDE_PORT = port.toString();
  }
  writeMCPConfig(configPath, config);
  logToSonarLintOutput(`Embedded server started on port: ${port}`);
}
