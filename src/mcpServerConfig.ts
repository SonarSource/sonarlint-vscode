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

export enum IDE {
  VSCODE = 'vscode',
  CURSOR = 'cursor',
  WINDSURF = 'windsurf',
  VSCODE_INSIDERS = 'vscode-insiders'
}

function isCopilotInstalledAndActive(): boolean {
  const copilotExtension = vscode.extensions.getExtension('GitHub.copilot');
  return copilotExtension?.isActive;
}

export function getCurrentIdeWithMCPSupport(): IDE | undefined {
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

export function getMCPConfigPath(): string {
  const currentIDE = getCurrentIdeWithMCPSupport();
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

function getCurrentSonarQubeMCPServerConfig(): MCPServerConfig | undefined {
  const currentIDE = getCurrentIdeWithMCPSupport();
  if (!currentIDE) {
    return undefined;
  }
  const configPath = getMCPConfigPath();
  const config = readMCPConfig(configPath);
  return currentIDE === IDE.VSCODE || currentIDE === IDE.VSCODE_INSIDERS
    ? (config as MCPConfigurationVSCode).servers.sonarqube
    : (config as MCPConfigurationOthers).mcpServers.sonarqube;
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

  const currentIDE = getCurrentIdeWithMCPSupport();
  return currentIDE === 'vscode' || currentIDE === 'vscode-insiders'
    ? {
        servers: {}
      }
    : {
        mcpServers: {}
      };
}

function writeSonarQubeMCPConfig(sonarQubeMCPConfig: MCPServerConfig): void {
  try {
    const currentIDE = getCurrentIdeWithMCPSupport();
    const configPath = getMCPConfigPath();
    const config = readMCPConfig(configPath);

    if (currentIDE === IDE.VSCODE || currentIDE === IDE.VSCODE_INSIDERS) {
      (config as MCPConfigurationVSCode).servers.sonarqube = sonarQubeMCPConfig;
    } else {
      (config as MCPConfigurationOthers).mcpServers.sonarqube = sonarQubeMCPConfig;
    }

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
    const token = await ConnectionSettingsService.instance.getTokenForConnection(connection);

    if (!token) {
      const proceed = await vscode.window.showWarningMessage(
        `The SonarQube connection "${connection.label}" doesn't have a token configured. The MCP server will be created but may not function properly without a valid token.`,
        'Proceed Anyway',
        'Cancel'
      );

      if (proceed !== 'Proceed Anyway') {
        return;
      }
    }

    const sonarQubeMCPConfig = await languageClient.getMCPServerConfiguration(connection.id, token);

    writeSonarQubeMCPConfig(JSON.parse(sonarQubeMCPConfig.jsonConfiguration));

    openMCPServersListIfCursor();

    const openFile = await vscode.window.showInformationMessage(
      `SonarQube MCP Server configured for "${connection.label}"`,
      'Open Configuration File'
    );

    if (openFile === 'Open Configuration File') {
      const uri = vscode.Uri.file(getMCPConfigPath());
      await vscode.window.showTextDocument(uri);
    }

    logToSonarLintOutput(`SonarQube MCP Server configured successfully for connection: ${connection.label}`);
  } catch (error) {
    const errorMessage = `Failed to configure SonarQube MCP Server for "${connection.label}": ${error.message}`;
    vscode.window.showErrorMessage(errorMessage);
    logToSonarLintOutput(errorMessage);
    throw error;
  }
}

function openMCPServersListIfCursor() {
  const currentIDE = getCurrentIdeWithMCPSupport();
  if (currentIDE === IDE.CURSOR) {
    vscode.commands.executeCommand('workbench.action.openMCPSettings');
  }
}

export function onEmbeddedServerStarted(port: number): void {
  const currentSonarQubeMCPConfig = getCurrentSonarQubeMCPServerConfig();
  if (!currentSonarQubeMCPConfig) {
    // if the MCP server is not configured, we don't need to update the config
    return;
  }
  currentSonarQubeMCPConfig.env.SONARQUBE_IDE_PORT = port.toString();

  writeSonarQubeMCPConfig(currentSonarQubeMCPConfig);
}
