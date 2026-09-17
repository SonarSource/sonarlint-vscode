/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) SonarSource Sàrl
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
import { Commands } from '../util/commands';
import { getCurrentAgentWithMCPSupport, IntegrationTarget, getWindsurfDirectory } from './aiAgentUtils';

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

export function getMCPConfigPath(): string {
  const currentAgent = getCurrentAgentWithMCPSupport();
  switch (currentAgent) {
    case IntegrationTarget.CURSOR:
      return path.join(os.homedir(), '.cursor', 'mcp.json');
    case IntegrationTarget.WINDSURF:
      return path.join(os.homedir(), '.codeium', getWindsurfDirectory(), 'mcp_config.json');
    case IntegrationTarget.KIRO:
      return path.join(os.homedir(), '.kiro', 'settings', 'mcp.json');
    case IntegrationTarget.GITHUB_COPILOT:
      // For GitHub Copilot, detect if it's VSCode or VSCode Insiders
      if (vscode.env.appName.toLowerCase().includes('insiders')) {
        return path.join(getVSCodeSettingsBaseDir(), 'Code - Insiders', 'User', 'mcp.json');
      } else {
        return path.join(getVSCodeSettingsBaseDir(), 'Code', 'User', 'mcp.json');
      }
    case undefined:
      throw new Error(`Unsupported agent: ${currentAgent}`);
    default: {
      const _exhaustive: never = currentAgent;
      throw new Error(`Unsupported agent: ${_exhaustive}`);
    }
  }
}

export function getCurrentSonarQubeMCPServerConfig(): MCPServerConfig | undefined {
  const currentAgent = getCurrentAgentWithMCPSupport();
  if (currentAgent === undefined) {
    return undefined;
  }
  const configPath = getMCPConfigPath();
  const config = readMCPConfig(configPath);
  return currentAgent === IntegrationTarget.GITHUB_COPILOT
    ? (config as MCPConfigurationVSCode).servers?.sonarqube
    : (config as MCPConfigurationOthers).mcpServers?.sonarqube;
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

  const currentAgent = getCurrentAgentWithMCPSupport();
  return currentAgent === IntegrationTarget.GITHUB_COPILOT
    ? {
        servers: {}
      }
    : {
        mcpServers: {}
      };
}

function writeSonarQubeMCPConfig(sonarQubeMCPConfig: MCPServerConfig): void {
  try {
    const currentAgent = getCurrentAgentWithMCPSupport();
    const configPath = getMCPConfigPath();
    const config = readMCPConfig(configPath);

    if (currentAgent === IntegrationTarget.GITHUB_COPILOT) {
      const vscodeConfig = config as MCPConfigurationVSCode;
      vscodeConfig.servers ??= {};
      vscodeConfig.servers.sonarqube = sonarQubeMCPConfig;
    } else {
      const agentConfig = config as MCPConfigurationOthers;
      agentConfig.mcpServers ??= {};
      agentConfig.mcpServers.sonarqube = sonarQubeMCPConfig;
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
    void vscode.commands.executeCommand(Commands.REFRESH_AI_AGENTS_CONFIGURATION);

    openMCPServersListIfCursor();

    const openFile = await vscode.window.showInformationMessage(
      `SonarQube MCP Server configured for "${selectedConnection.label}"`,
      'Open Configuration File'
    );

    if (openFile === 'Open Configuration File') {
      await openMCPServerConfigurationFile();
    }

    logToSonarLintOutput(`SonarQube MCP Server configured successfully for connection: ${selectedConnection.label}`);
  } catch (error) {
    const connectionLabel = connection?.label || 'unknown connection';
    const errorMessage = `Failed to configure SonarQube MCP Server for "${connectionLabel}": ${error.message}`;
    vscode.window.showErrorMessage(errorMessage);
    logToSonarLintOutput(errorMessage);
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

function openMCPServersListIfCursor() {
  const currentAgent = getCurrentAgentWithMCPSupport();
  if (currentAgent === IntegrationTarget.CURSOR) {
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

export async function openMCPServerConfigurationFile(): Promise<void> {
  const uri = vscode.Uri.file(getMCPConfigPath());
  await vscode.window.showTextDocument(uri);
}
