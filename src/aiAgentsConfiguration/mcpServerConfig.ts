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
import { logToSonarLintOutput } from '../util/logging';
import { AllConnectionsTreeDataProvider, Connection } from '../connected/connections';
import { ConnectionSettingsService } from '../settings/connectionsettings';
import { SonarLintExtendedLanguageClient } from '../lsp/client';
import * as os from 'node:os';
import { getVSCodeSettingsBaseDir } from '../util/util';
import { getCurrentIdeWithMCPSupport, IDE } from './aiAgentUtils';

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

export async function getMCPConfigPath(): Promise<string> {
  const currentIDE = await getCurrentIdeWithMCPSupport();
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

export async function getCurrentSonarQubeMCPServerConfig(): Promise<MCPServerConfig | undefined> {
  const currentIDE = await getCurrentIdeWithMCPSupport();
  if (!currentIDE) {
    return undefined;
  }
  const configPath = await getMCPConfigPath();
  const config = await readMCPConfig(configPath);
  return currentIDE === IDE.VSCODE || currentIDE === IDE.VSCODE_INSIDERS
    ? (config as MCPConfigurationVSCode).servers.sonarqube
    : (config as MCPConfigurationOthers).mcpServers.sonarqube;
}

async function readMCPConfig(configPath: string): Promise<MCPConfigurationOthers | MCPConfigurationVSCode> {
  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(content);
    }
  } catch (error) {
    logToSonarLintOutput(`Error reading MCP config: ${error.message}`);
  }

  const currentIDE = await getCurrentIdeWithMCPSupport();
  return currentIDE === 'vscode' || currentIDE === 'vscode-insiders'
    ? {
        servers: {}
      }
    : {
        mcpServers: {}
      };
}

async function writeSonarQubeMCPConfig(sonarQubeMCPConfig: MCPServerConfig): Promise<void> {
  try {
    const currentIDE = await getCurrentIdeWithMCPSupport();
    const configPath = await getMCPConfigPath();
    const config = await readMCPConfig(configPath);

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
  languageClient: SonarLintExtendedLanguageClient,
  allConnectionsTreeDataProvider: AllConnectionsTreeDataProvider,
  connection?: Connection
): Promise<void> {
  try {
    const selectedConnection = await getSelectedConnection(allConnectionsTreeDataProvider, connection);

    if (!selectedConnection) {
      return;
    }

    const token = await ConnectionSettingsService.instance.getTokenForConnection(selectedConnection);

    if (!token) {
      const proceed = await vscode.window.showWarningMessage(
        `The SonarQube connection "${selectedConnection.label}" doesn't have a token configured. The MCP server will be created but may not function properly without a valid token.`,
        'Proceed Anyway',
        'Cancel'
      );

      if (proceed !== 'Proceed Anyway') {
        return;
      }
    }

    const sonarQubeMCPConfig = await languageClient.getMCPServerConfiguration(selectedConnection.id, token);

    writeSonarQubeMCPConfig(JSON.parse(sonarQubeMCPConfig.jsonConfiguration));

    openMCPServersListIfCursor();

    const openFile = await vscode.window.showInformationMessage(
      `SonarQube MCP server configured for "${selectedConnection.label}"`,
      'Open Configuration File'
    );

    if (openFile === 'Open Configuration File') {
      await openMCPServerConfigurationFile();
    }

    logToSonarLintOutput(`SonarQube MCP server configured successfully for connection: ${selectedConnection.label}`);
  } catch (error) {
    const connectionLabel = connection?.label || 'unknown connection';
    const errorMessage = `Failed to configure SonarQube MCP server for "${connectionLabel}": ${error.message}`;
    vscode.window.showErrorMessage(errorMessage);
    logToSonarLintOutput(errorMessage);
    throw error;
  }
}

async function getSelectedConnection(
  allConnectionsTreeDataProvider: AllConnectionsTreeDataProvider,
  connection?: Connection
): Promise<Connection | undefined> {
  if (connection) {
    return connection;
  }

  const allConnections = [
    ...(await allConnectionsTreeDataProvider.getConnections('__sonarqube__')),
    ...(await allConnectionsTreeDataProvider.getConnections('__sonarcloud__'))
  ];

  if (allConnections.length === 0) {
    warnNoConnectionConfigured();
    return undefined;
  } else if (allConnections.length === 1) {
    return allConnections[0];
  } else {
    const connectionItems = allConnections.map(conn => ({
      label: conn.label,
      description: conn.contextValue === 'sonarqubeConnection' ? 'SonarQube Server' : 'SonarQube Cloud',
      connection: conn
    }));

    const selectedItem = await vscode.window.showQuickPick(connectionItems, {
      placeHolder: 'Select a SonarQube connection for MCP server configuration',
      matchOnDescription: true
    });

    if (!selectedItem) {
      return undefined;
    }

    return selectedItem.connection;
  }
}

function warnNoConnectionConfigured() {
  vscode.window
    .showWarningMessage(
      'No SonarQube (Server or Cloud) connections found. Please set up a connection first.',
      'Set up Connection'
    )
    .then(action => {
      if (action === 'Set up Connection') {
        vscode.commands.executeCommand('SonarLint.ConnectedMode.focus');
      }
    });
}

async function openMCPServersListIfCursor() {
  const currentIDE = await getCurrentIdeWithMCPSupport();
  if (currentIDE === IDE.CURSOR) {
    vscode.commands.executeCommand('workbench.action.openMCPSettings');
  }
}

export async function onEmbeddedServerStarted(port: number): Promise<void> {
  const currentSonarQubeMCPConfig = await getCurrentSonarQubeMCPServerConfig();
  if (!currentSonarQubeMCPConfig) {
    // if the MCP server is not configured, we don't need to update the config
    return;
  }
  currentSonarQubeMCPConfig.env.SONARQUBE_IDE_PORT = port.toString();

  writeSonarQubeMCPConfig(currentSonarQubeMCPConfig);
}

export async function openMCPServerConfigurationFile(): Promise<void> {
  const uri = vscode.Uri.file(await getMCPConfigPath());
  await vscode.window.showTextDocument(uri);
}