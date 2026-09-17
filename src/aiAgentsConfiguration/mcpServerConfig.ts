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
import { SonarLintExtendedLanguageClient } from '../lsp/client';
import { ExtendedServer } from '../lsp/protocol';
import { ConnectionSettingsService } from '../settings/connectionsettings';
import { Commands } from '../util/commands';
import { logToSonarLintOutput } from '../util/logging';
import { getVSCodeSettingsBaseDir } from '../util/util';
import { getCurrentIntegrationTargetWithMCPSupport, getWindsurfDirectory, INTEGRATION_TARGET } from './aiAgentUtils';
import { AiIntegrationService, toProtocolAgent } from './aiIntegrationService';

const MCP_CONNECTION_KEY = 'aiAgentsConfiguration.mcpConnection';

interface PersistedMCPConnection {
  id: string;
  type: Connection['contextValue'];
}

export function getMCPConfigPath(): string {
  const currentAgent = getCurrentIntegrationTargetWithMCPSupport();
  switch (currentAgent) {
    case INTEGRATION_TARGET.CURSOR:
      return path.join(os.homedir(), '.cursor', 'mcp.json');
    case INTEGRATION_TARGET.WINDSURF:
      return path.join(os.homedir(), '.codeium', getWindsurfDirectory(), 'mcp_config.json');
    case INTEGRATION_TARGET.KIRO:
      return path.join(os.homedir(), '.kiro', 'settings', 'mcp.json');
    case INTEGRATION_TARGET.GITHUB_COPILOT:
      return path.join(
        getVSCodeSettingsBaseDir(),
        vscode.env.appName.toLowerCase().includes('insiders') ? 'Code - Insiders' : 'Code',
        'User',
        'mcp.json'
      );
    default:
      throw new Error(`Unsupported agent: ${currentAgent}`);
  }
}

export async function inspectCurrentMCPConfiguration(
  aiIntegrationService: AiIntegrationService
): Promise<ExtendedServer.McpConfigurationInspectionResponse | undefined> {
  const currentAgent = getCurrentIntegrationTargetWithMCPSupport();
  if (!currentAgent) {
    return undefined;
  }
  return aiIntegrationService.inspectMcpConfiguration({
    agent: toProtocolAgent(currentAgent),
    content: readMCPConfigContent(getMCPConfigPath())
  });
}

function readMCPConfigContent(configPath: string): string | null {
  return fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : null;
}

function isUpdateAllowed(state: ExtendedServer.McpConfigurationState): boolean {
  return (
    state === ExtendedServer.McpConfigurationState.NOT_CONFIGURED ||
    state === ExtendedServer.McpConfigurationState.STANDALONE
  );
}

function showBlockedConfigurationMessage(inspection: ExtendedServer.McpConfigurationInspectionResponse): void {
  const message = inspection.diagnostics[0] ?? 'The existing SonarQube MCP configuration cannot be updated safely.';
  if (inspection.state === ExtendedServer.McpConfigurationState.MALFORMED) {
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
    fs.copyFileSync(configPath, `${configPath}.bak`);
  }
  fs.writeFileSync(configPath, content, 'utf8');
}

export async function configureMCPServer(
  languageClient: SonarLintExtendedLanguageClient,
  aiIntegrationService: AiIntegrationService,
  allConnectionsTreeDataProvider: AllConnectionsTreeDataProvider,
  extensionContext: vscode.ExtensionContext,
  connection?: Connection
): Promise<void> {
  let selectedConnection = connection;
  try {
    const inspection = await inspectCurrentMCPConfiguration(aiIntegrationService);
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

    const currentAgent = getCurrentIntegrationTargetWithMCPSupport();
    if (!currentAgent) {
      throw new Error('Standalone MCP is not supported by the current IDE agent.');
    }
    const configPath = getMCPConfigPath();
    const content = readMCPConfigContent(configPath);
    const connectionId = selectedConnection.id || DEFAULT_CONNECTION_ID;
    const sonarQubeMCPConfig = await languageClient.getMCPServerConfiguration(connectionId, token ?? '');
    const updatePlan = await aiIntegrationService.planMcpConfigurationUpdate({
      agent: toProtocolAgent(currentAgent),
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

    const openFile = await vscode.window.showInformationMessage(
      `SonarQube MCP Server configured for "${selectedConnection.label}"`,
      'Open Configuration File'
    );
    if (openFile === 'Open Configuration File') {
      await openMCPServerConfigurationFile();
    }
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
  if (getCurrentIntegrationTargetWithMCPSupport() === INTEGRATION_TARGET.CURSOR) {
    vscode.commands.executeCommand('workbench.action.openMCPSettings');
  }
}

export async function onEmbeddedServerStarted(
  languageClient: SonarLintExtendedLanguageClient,
  aiIntegrationService: AiIntegrationService,
  extensionContext: vscode.ExtensionContext
): Promise<void> {
  try {
    const currentAgent = getCurrentIntegrationTargetWithMCPSupport();
    if (!currentAgent) {
      return;
    }
    const configPath = getMCPConfigPath();
    const content = readMCPConfigContent(configPath);
    if (content == null) {
      return;
    }
    const inspection = await aiIntegrationService.inspectMcpConfiguration({
      agent: toProtocolAgent(currentAgent),
      content
    });
    if (inspection.state !== ExtendedServer.McpConfigurationState.STANDALONE) {
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
    const updatePlan = await aiIntegrationService.planMcpConfigurationUpdate({
      agent: toProtocolAgent(currentAgent),
      content,
      sonarMcpConfiguration: sonarQubeMCPConfig.jsonConfiguration
    });
    if (
      updatePlan.state === ExtendedServer.McpConfigurationState.STANDALONE &&
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
