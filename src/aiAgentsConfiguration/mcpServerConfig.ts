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
import {
  ConnectionSettingsService,
  getTokenStorageKey,
  SonarCloudConnection,
  SonarQubeConnection
} from '../settings/connectionsettings';
import { logToSonarLintOutput } from '../util/logging';
import { getVSCodeSettingsBaseDir } from '../util/util';
import { getCurrentAgentWithMCPSupport, getWindsurfDirectory, IntegrationTarget } from './aiAgentUtils';

const MCP_CONNECTION_KEY = 'aiAgentsConfiguration.mcpConnection';
const UNSUPPORTED_AGENT_MESSAGE = 'Standalone MCP is not supported by the current IDE agent.';
const BLOCKED_CONFIGURATION_MESSAGE = 'The existing SonarQube MCP configuration cannot be updated safely.';
const WRITE_FAILED_PREFIX = 'Failed to configure SonarQube MCP Server for';

interface PersistedMCPConnection {
  id: string;
  type: Connection['contextValue'];
}

interface McpDocument {
  agent: IntegrationTarget;
  path: string;
  content: string | null;
}

interface ResolvedMcpConnection {
  settingsConnectionId: string | undefined;
  sllsConnectionId: string;
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
  const document = readMcpDocument();
  if (!document) {
    return undefined;
  }
  return inspectMcpDocument(languageClient, document);
}

function readMcpDocument(): McpDocument | undefined {
  const agent = getCurrentAgentWithMCPSupport();
  if (agent === undefined) {
    return undefined;
  }
  const configPath = getMCPConfigPath();
  return { agent, path: configPath, content: readMCPConfigContent(configPath) };
}

function readMCPConfigContent(configPath: string): string | null {
  return fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : null;
}

async function inspectMcpDocument(
  languageClient: SonarLintExtendedLanguageClient,
  document: McpDocument
): Promise<AiIntegration.McpConfigurationInspectionResponse> {
  return languageClient.inspectMcpConfiguration({
    agent: document.agent,
    content: document.content
  });
}

async function planMcpDocument(
  languageClient: SonarLintExtendedLanguageClient,
  document: McpDocument,
  connectionId: string,
  token: string
): Promise<AiIntegration.McpConfigurationUpdatePlanResponse> {
  const sonarQubeMCPConfig = await languageClient.getMCPServerConfiguration(connectionId, token);
  return languageClient.planMcpConfigurationUpdate({
    agent: document.agent,
    content: document.content,
    sonarMcpConfiguration: sonarQubeMCPConfig.jsonConfiguration
  });
}

function isUpdateAllowed(state: AiIntegration.McpConfigurationState): boolean {
  switch (state) {
    case AiIntegration.McpConfigurationState.NOT_CONFIGURED:
    case AiIntegration.McpConfigurationState.STANDALONE:
      return true;
    case AiIntegration.McpConfigurationState.CLI_MANAGED:
    case AiIntegration.McpConfigurationState.UNKNOWN:
    case AiIntegration.McpConfigurationState.MALFORMED:
      return false;
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

function showBlockedConfigurationMessage(inspection: AiIntegration.McpConfigurationInspectionResponse): void {
  const message = inspection.diagnostics[0] ?? BLOCKED_CONFIGURATION_MESSAGE;
  if (inspection.state === AiIntegration.McpConfigurationState.MALFORMED) {
    vscode.window.showErrorMessage(message);
  } else {
    vscode.window.showWarningMessage(message);
  }
}

export function backupMcpConfig(configPath: string): void {
  const backupPath = `${configPath}.bak`;
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(configPath, backupPath);
  }
}

function writeMcpDocument(configPath: string, content: string): void {
  const configExists = fs.existsSync(configPath);
  const configDir = path.dirname(configPath);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  if (configExists) {
    backupMcpConfig(configPath);
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
    const document = readMcpDocument();
    if (!document) {
      throw new Error(UNSUPPORTED_AGENT_MESSAGE);
    }
    const inspection = await inspectMcpDocument(languageClient, document);
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

    const connectionId = selectedConnection.id || DEFAULT_CONNECTION_ID;
    const updatePlan = await planMcpDocument(languageClient, document, connectionId, token ?? '');
    if (!isUpdateAllowed(updatePlan.state) || updatePlan.updatedContent == null) {
      showBlockedConfigurationMessage(updatePlan);
      return;
    }

    writeMcpDocument(document.path, updatePlan.updatedContent);
    await extensionContext.globalState.update(MCP_CONNECTION_KEY, {
      id: connectionId,
      type: selectedConnection.contextValue
    } satisfies PersistedMCPConnection);
    openMCPServersListIfCursor();

    void vscode.window
      .showInformationMessage(
        `SonarQube MCP Server configured for "${selectedConnection.label}"`,
        'Open Configuration File'
      )
      .then(async openFile => {
        if (openFile === 'Open Configuration File') {
          await openMCPServerConfigurationFile();
        }
      });
    logToSonarLintOutput(`SonarQube MCP Server configured successfully for connection: ${selectedConnection.label}`);
  } catch (error) {
    const connectionLabel = selectedConnection?.label ?? 'unknown connection';
    const errorMessage = `${WRITE_FAILED_PREFIX} "${connectionLabel}": ${error.message}`;
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
    const document = readMcpDocument();
    if (document?.content == null) {
      return;
    }
    const inspection = await inspectMcpDocument(languageClient, document);
    if (inspection.state !== AiIntegration.McpConfigurationState.STANDALONE) {
      return;
    }

    const connection = resolvePersistedConnection(extensionContext);
    if (!connection) {
      return;
    }
    const token = await getTokenForResolvedConnection(connection);
    if (!token) {
      return;
    }
    const updatePlan = await planMcpDocument(languageClient, document, connection.sllsConnectionId, token);
    if (
      updatePlan.state === AiIntegration.McpConfigurationState.STANDALONE &&
      updatePlan.updatedContent != null &&
      updatePlan.updatedContent !== document.content
    ) {
      writeMcpDocument(document.path, updatePlan.updatedContent);
    }
  } catch (error) {
    logToSonarLintOutput(`Could not refresh the standalone SonarQube MCP configuration: ${error.message}`);
  }
}

export function hasPersistedMCPConnection(extensionContext: vscode.ExtensionContext): boolean {
  return resolvePersistedConnection(extensionContext) !== undefined;
}

function resolvePersistedConnection(extensionContext: vscode.ExtensionContext): ResolvedMcpConnection | undefined {
  const persistedConnection = extensionContext.globalState.get<PersistedMCPConnection>(MCP_CONNECTION_KEY);
  if (!persistedConnection) {
    return undefined;
  }

  const settings = ConnectionSettingsService.instance;
  const candidates: Array<SonarQubeConnection | SonarCloudConnection> =
    persistedConnection.type === 'sonarqubeConnection'
      ? settings.getSonarQubeConnections()
      : settings.getSonarCloudConnections();
  const match = candidates.find(
    candidate => (candidate.connectionId ?? DEFAULT_CONNECTION_ID) === persistedConnection.id
  );
  if (!match) {
    return undefined;
  }
  return {
    settingsConnectionId: match.connectionId,
    sllsConnectionId: match.connectionId ?? DEFAULT_CONNECTION_ID,
    type: persistedConnection.type
  };
}

async function getTokenForResolvedConnection(connection: ResolvedMcpConnection): Promise<string | undefined> {
  const settings = ConnectionSettingsService.instance;
  const candidates: Array<SonarQubeConnection | SonarCloudConnection> =
    connection.type === 'sonarqubeConnection'
      ? settings.getSonarQubeConnections()
      : settings.getSonarCloudConnections();
  const match = candidates.find(candidate => candidate.connectionId === connection.settingsConnectionId);
  if (!match) {
    return undefined;
  }
  return settings.getServerToken(getTokenStorageKey(match));
}

export async function openMCPServerConfigurationFile(): Promise<void> {
  const configPath = getMCPConfigPath();
  if (!fs.existsSync(configPath)) {
    await vscode.window.showInformationMessage('The MCP configuration file has not been created yet.');
    return;
  }
  await vscode.window.showTextDocument(vscode.Uri.file(configPath));
}
