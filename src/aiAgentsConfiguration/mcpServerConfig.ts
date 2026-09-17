/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { DEFAULT_CONNECTION_ID } from '../commons';
import { AllConnectionsTreeDataProvider, Connection } from '../connected/connections';
import { AiIntegration } from '../lsp/aiIntegrationProtocol';
import { SonarLintExtendedLanguageClient } from '../lsp/client';
import { ConnectionSettingsService } from '../settings/connectionsettings';
import { Commands } from '../util/commands';
import { logToSonarLintOutput } from '../util/logging';
import { getVSCodeSettingsBaseDir } from '../util/util';
import { getCurrentAgentWithMCPSupport, getWindsurfDirectory, IntegrationTarget } from './aiAgentUtils';

const MCP_CONNECTION_KEY = 'aiAgentsConfiguration.mcpConnection';

interface PersistedMCPConnection {
  id: string;
  type: Connection['contextValue'];
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
      return path.join(
        getVSCodeSettingsBaseDir(),
        vscode.env.appName.toLowerCase().includes('insiders') ? 'Code - Insiders' : 'Code',
        'User',
        'mcp.json'
      );
    case undefined:
      throw new Error(`Unsupported agent: ${currentAgent}`);
    default: {
      const _exhaustive: never = currentAgent;
      throw new Error(`Unsupported agent: ${_exhaustive}`);
    }
  }
}

export async function inspectCurrentMCPConfiguration(
  languageClient: SonarLintExtendedLanguageClient
): Promise<AiIntegration.McpConfigurationInspectionResponse | undefined> {
  const currentAgent = getCurrentAgentWithMCPSupport();
  if (currentAgent === undefined) {
    return undefined;
  }
  return languageClient.inspectMcpConfiguration({
    agent: currentAgent,
    content: readMCPConfigContent(getMCPConfigPath())
  });
}

function readMCPConfigContent(configPath: string): string | null {
  return fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : null;
}

function isUpdateAllowed(state: AiIntegration.McpConfigurationState): boolean {
  return (
    state === AiIntegration.McpConfigurationState.NOT_CONFIGURED ||
    state === AiIntegration.McpConfigurationState.STANDALONE
  );
}

function showBlockedConfigurationMessage(inspection: AiIntegration.McpConfigurationInspectionResponse): void {
  const message = inspection.diagnostics[0] ?? 'The existing SonarQube MCP configuration cannot be updated safely.';
  if (inspection.state === AiIntegration.McpConfigurationState.MALFORMED) {
    vscode.window.showErrorMessage(message);
  } else {
    vscode.window.showWarningMessage(message);
  }
}

function writeMCPConfig(configPath: string, content: string): void {
  const configExists = fs.existsSync(configPath);
  const configDir = path.dirname(configPath);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  if (configExists) {
    const backupPath = `${configPath}.bak`;
    if (!fs.existsSync(backupPath)) {
      fs.copyFileSync(configPath, backupPath);
    }
  }
  fs.writeFileSync(configPath, content, 'utf8');
}

export async function configureMCPServer(
  languageClient: SonarLintExtendedLanguageClient,
  allConnectionsTreeDataProvider: AllConnectionsTreeDataProvider,
  extensionContext: vscode.ExtensionContext,
  connection?: Connection
): Promise<void> {
  let selectedConnection = connection;
  try {
    const inspection = await inspectCurrentMCPConfiguration(languageClient);
    if (!inspection) {
      throw new Error('Standalone MCP is not supported by the current IDE agent.');
    }
    if (!isUpdateAllowed(inspection.state)) {
      showBlockedConfigurationMessage(inspection);
      return;
    }

    selectedConnection = await getSelectedConnection(allConnectionsTreeDataProvider, connection);
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

    const currentAgent = getCurrentAgentWithMCPSupport();
    if (currentAgent === undefined) {
      throw new Error('Standalone MCP is not supported by the current IDE agent.');
    }
    const configPath = getMCPConfigPath();
    const content = readMCPConfigContent(configPath);
    const connectionId = selectedConnection.id || DEFAULT_CONNECTION_ID;
    const sonarQubeMCPConfig = await languageClient.getMCPServerConfiguration(connectionId, token ?? '');
    const updatePlan = await languageClient.planMcpConfigurationUpdate({
      agent: currentAgent,
      content,
      sonarMcpConfiguration: sonarQubeMCPConfig.jsonConfiguration
    });
    if (!isUpdateAllowed(updatePlan.state) || updatePlan.updatedContent == null) {
      showBlockedConfigurationMessage(updatePlan);
      return;
    }

    writeMCPConfig(configPath, updatePlan.updatedContent);
    await extensionContext.globalState.update(MCP_CONNECTION_KEY, {
      id: connectionId,
      type: selectedConnection.contextValue
    } satisfies PersistedMCPConnection);
    await vscode.commands.executeCommand(Commands.REFRESH_AI_AGENTS_CONFIGURATION);
    openMCPServersListIfCursor();

    void vscode.window
      .showInformationMessage(
        `SonarQube MCP Server configured for "${selectedConnection.label}"`,
        'Open Configuration File'
      )
      .then(openFile => {
        if (openFile === 'Open Configuration File') {
          return openMCPServerConfigurationFile();
        }
      });
    logToSonarLintOutput(`SonarQube MCP Server configured successfully for connection: ${selectedConnection.label}`);
  } catch (error) {
    const connectionLabel = selectedConnection?.label ?? 'unknown connection';
    const errorMessage = `Failed to configure SonarQube MCP Server for "${connectionLabel}": ${error.message}`;
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
  }
  if (allConnections.length === 1) {
    return allConnections[0];
  }

  const selectedItem = await vscode.window.showQuickPick(
    allConnections.map(candidate => ({
      label: candidate.label,
      description: candidate.contextValue === 'sonarqubeConnection' ? 'SonarQube Server' : 'SonarQube Cloud',
      connection: candidate
    })),
    {
      placeHolder: 'Select a SonarQube connection for MCP server configuration',
      matchOnDescription: true
    }
  );
  return selectedItem?.connection;
}

function warnNoConnectionConfigured(): void {
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

function openMCPServersListIfCursor(): void {
  if (getCurrentAgentWithMCPSupport() === IntegrationTarget.CURSOR) {
    vscode.commands.executeCommand('workbench.action.openMCPSettings');
  }
}

export async function onEmbeddedServerStarted(
  languageClient: SonarLintExtendedLanguageClient,
  extensionContext: vscode.ExtensionContext
): Promise<void> {
  try {
    const currentAgent = getCurrentAgentWithMCPSupport();
    if (currentAgent === undefined) {
      return;
    }
    const configPath = getMCPConfigPath();
    const content = readMCPConfigContent(configPath);
    if (content == null) {
      return;
    }
    const inspection = await languageClient.inspectMcpConfiguration({
      agent: currentAgent,
      content
    });
    if (inspection.state !== AiIntegration.McpConfigurationState.STANDALONE) {
      return;
    }

    const connection = getPersistedConnection(extensionContext);
    if (!connection) {
      return;
    }
    const token = await ConnectionSettingsService.instance.getTokenForConnection(connection);
    if (!token) {
      return;
    }
    const connectionId = connection.id || DEFAULT_CONNECTION_ID;
    const sonarQubeMCPConfig = await languageClient.getMCPServerConfiguration(connectionId, token);
    const updatePlan = await languageClient.planMcpConfigurationUpdate({
      agent: currentAgent,
      content,
      sonarMcpConfiguration: sonarQubeMCPConfig.jsonConfiguration
    });
    if (
      updatePlan.state === AiIntegration.McpConfigurationState.STANDALONE &&
      updatePlan.updatedContent != null &&
      updatePlan.updatedContent !== content
    ) {
      writeMCPConfig(configPath, updatePlan.updatedContent);
      await vscode.commands.executeCommand(Commands.REFRESH_AI_AGENTS_CONFIGURATION);
    }
  } catch (error) {
    logToSonarLintOutput(`Could not refresh the standalone SonarQube MCP configuration: ${error.message}`);
  }
}

export function hasPersistedMCPConnection(extensionContext: vscode.ExtensionContext): boolean {
  return getPersistedConnection(extensionContext) !== undefined;
}

function getPersistedConnection(extensionContext: vscode.ExtensionContext): Connection | undefined {
  const persistedConnection = extensionContext.globalState.get<PersistedMCPConnection>(MCP_CONNECTION_KEY);
  if (!persistedConnection) {
    return undefined;
  }

  const settings = ConnectionSettingsService.instance;
  const candidates =
    persistedConnection.type === 'sonarqubeConnection'
      ? settings.getSonarQubeConnections()
      : settings.getSonarCloudConnections();
  const match = candidates.find(
    candidate => (candidate.connectionId ?? DEFAULT_CONNECTION_ID) === persistedConnection.id
  );
  return match
    ? new Connection(match.connectionId as string, persistedConnection.id, persistedConnection.type, 'ok')
    : undefined;
}

export async function openMCPServerConfigurationFile(): Promise<void> {
  const configPath = getMCPConfigPath();
  if (!fs.existsSync(configPath)) {
    await vscode.window.showInformationMessage('The MCP configuration file has not been created yet.');
    return;
  }
  await vscode.window.showTextDocument(vscode.Uri.file(configPath));
}
