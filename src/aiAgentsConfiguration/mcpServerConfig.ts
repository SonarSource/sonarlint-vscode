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
import {
  getCurrentIdeHost,
  getDetectedIdeAgents,
  getWindsurfDirectory,
  IDE_HOST,
  INTEGRATION_TARGET
} from './aiAgentUtils';
import { AiIntegrationService, toProtocolAgent } from './aiIntegrationService';

const LEGACY_MCP_CONNECTION_KEY = 'aiAgentsConfiguration.mcpConnection';
const MCP_CONNECTION_KEY_PREFIX = 'aiAgentsConfiguration.mcpConnection.';
let mcpSetupInProgress = false;

interface PersistedMCPConnection {
  id: string;
  type: Connection['contextValue'];
}

export function supportsStandaloneMCP(agent: INTEGRATION_TARGET): boolean {
  return [
    INTEGRATION_TARGET.GITHUB_COPILOT,
    INTEGRATION_TARGET.CLAUDE_CODE,
    INTEGRATION_TARGET.CURSOR,
    INTEGRATION_TARGET.WINDSURF,
    INTEGRATION_TARGET.KIRO
  ].includes(agent);
}

export function getMCPConfigPath(agent: INTEGRATION_TARGET): string {
  switch (agent) {
    case INTEGRATION_TARGET.GITHUB_COPILOT:
      return path.join(
        getVSCodeSettingsBaseDir(),
        vscode.env.appName.toLowerCase().includes('insiders') ? 'Code - Insiders' : 'Code',
        'User',
        'mcp.json'
      );
    case INTEGRATION_TARGET.CLAUDE_CODE:
      return path.join(os.homedir(), '.claude.json');
    case INTEGRATION_TARGET.CURSOR:
      return path.join(os.homedir(), '.cursor', 'mcp.json');
    case INTEGRATION_TARGET.WINDSURF:
      return path.join(os.homedir(), '.codeium', getWindsurfDirectory(), 'mcp_config.json');
    case INTEGRATION_TARGET.KIRO:
      return path.join(os.homedir(), '.kiro', 'settings', 'mcp.json');
    default:
      throw new Error(`Standalone MCP is not supported for ${agent}.`);
  }
}

export async function inspectMCPConfiguration(
  agent: INTEGRATION_TARGET,
  aiIntegrationService: AiIntegrationService
): Promise<ExtendedServer.McpConfigurationInspectionResponse> {
  return aiIntegrationService.inspectMcpConfiguration({
    agent: toProtocolAgent(agent),
    content: readMCPConfigContent(getMCPConfigPath(agent))
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

export function isMCPSetupInProgress(): boolean {
  return mcpSetupInProgress;
}

export async function configureMCPServer(
  languageClient: SonarLintExtendedLanguageClient,
  aiIntegrationService: AiIntegrationService,
  allConnectionsTreeDataProvider: AllConnectionsTreeDataProvider,
  extensionContext: vscode.ExtensionContext,
  requestedAgent?: INTEGRATION_TARGET,
  connection?: Connection
): Promise<void> {
  if (vscode.env.remoteName !== undefined) {
    await vscode.window.showInformationMessage('Standalone MCP setup is not available in remote IDE windows.');
    return;
  }
  if (mcpSetupInProgress) {
    return;
  }
  mcpSetupInProgress = true;
  let selectedConnection = connection;
  try {
    await migrateLegacyMCPConnection(extensionContext);
    const agent = await selectMCPAgent(requestedAgent);
    if (!agent) {
      return;
    }
    const inspection = await inspectMCPConfiguration(agent, aiIntegrationService);
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

    const configPath = getMCPConfigPath(agent);
    const content = readMCPConfigContent(configPath);
    const connectionId = selectedConnection.id || DEFAULT_CONNECTION_ID;
    const sonarQubeMCPConfig = await languageClient.getMCPServerConfiguration(connectionId, token ?? '');
    const updatePlan = await aiIntegrationService.planMcpConfigurationUpdate({
      agent: toProtocolAgent(agent),
      content,
      sonarMcpConfiguration: sonarQubeMCPConfig.jsonConfiguration
    });
    if (!isUpdateAllowed(updatePlan.state) || updatePlan.updatedContent == null) {
      showBlockedConfigurationMessage(updatePlan);
      return;
    }

    writeMCPConfig(configPath, updatePlan.updatedContent);
    await extensionContext.globalState.update(mcpConnectionKey(agent), {
      id: connectionId,
      type: selectedConnection.contextValue
    } satisfies PersistedMCPConnection);
    await vscode.commands.executeCommand(Commands.REFRESH_AI_AGENTS_CONFIGURATION);
    openMCPServersListIfCursor(agent);

    const openFile = await vscode.window.showInformationMessage(
      `SonarQube MCP Server configured for ${displayName(agent)} with "${selectedConnection.label}"`,
      'Open Configuration File'
    );
    if (openFile === 'Open Configuration File') {
      await openMCPServerConfigurationFile(agent);
    }
    logToSonarLintOutput(
      `SonarQube MCP Server configured successfully for ${displayName(agent)} and connection: ${selectedConnection.label}`
    );
  } catch (error) {
    const connectionLabel = selectedConnection?.label ?? 'unknown connection';
    const errorMessage = `Failed to configure SonarQube MCP Server for "${connectionLabel}": ${error.message}`;
    vscode.window.showErrorMessage(errorMessage);
    logToSonarLintOutput(errorMessage);
    throw error;
  } finally {
    mcpSetupInProgress = false;
  }
}

async function selectMCPAgent(requestedAgent?: INTEGRATION_TARGET): Promise<INTEGRATION_TARGET | undefined> {
  const detectedAgents = getDetectedIdeAgents();
  if (requestedAgent) {
    if (!detectedAgents.some(agent => agent.id === requestedAgent)) {
      await vscode.window.showInformationMessage(`${displayName(requestedAgent)} was not detected in this IDE.`);
      return undefined;
    }
    if (!supportsStandaloneMCP(requestedAgent)) {
      await vscode.window.showInformationMessage(
        `${displayName(requestedAgent)} MCP integration is available through CLI.`
      );
      return undefined;
    }
    return requestedAgent;
  }

  const agents = detectedAgents.filter(agent => supportsStandaloneMCP(agent.id));
  if (agents.length === 0) {
    await vscode.window.showInformationMessage('No agent with standalone MCP support was detected in this IDE.');
    return undefined;
  }
  if (agents.length === 1) {
    return agents[0].id;
  }
  const selected = await vscode.window.showQuickPick(
    agents.map(agent => ({ label: agent.name, description: getMCPConfigPath(agent.id), agent: agent.id })),
    { placeHolder: 'Choose an agent to configure with SonarQube MCP' }
  );
  return selected?.agent;
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

function openMCPServersListIfCursor(agent: INTEGRATION_TARGET): void {
  if (agent === INTEGRATION_TARGET.CURSOR) {
    vscode.commands.executeCommand('workbench.action.openMCPSettings');
  }
}

export async function onEmbeddedServerStarted(
  languageClient: SonarLintExtendedLanguageClient,
  aiIntegrationService: AiIntegrationService,
  extensionContext: vscode.ExtensionContext
): Promise<void> {
  if (mcpSetupInProgress) {
    return;
  }
  mcpSetupInProgress = true;
  try {
    await migrateLegacyMCPConnection(extensionContext);
    const agents = getDetectedIdeAgents().filter(agent => supportsStandaloneMCP(agent.id));
    await Promise.all(
      agents.map(agent =>
        refreshStandaloneMCPConfiguration(agent.id, languageClient, aiIntegrationService, extensionContext)
      )
    );
  } finally {
    mcpSetupInProgress = false;
  }
}

async function refreshStandaloneMCPConfiguration(
  agent: INTEGRATION_TARGET,
  languageClient: SonarLintExtendedLanguageClient,
  aiIntegrationService: AiIntegrationService,
  extensionContext: vscode.ExtensionContext
): Promise<void> {
  try {
    const configPath = getMCPConfigPath(agent);
    const content = readMCPConfigContent(configPath);
    if (content == null) {
      return;
    }
    const inspection = await aiIntegrationService.inspectMcpConfiguration({
      agent: toProtocolAgent(agent),
      content
    });
    if (inspection.state !== ExtendedServer.McpConfigurationState.STANDALONE) {
      return;
    }

    const connection = getPersistedConnection(extensionContext, agent);
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
      agent: toProtocolAgent(agent),
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
    logToSonarLintOutput(
      `Could not refresh the standalone SonarQube MCP configuration for ${displayName(agent)}: ${error.message}`
    );
  }
}

export async function migrateLegacyMCPConnection(extensionContext: vscode.ExtensionContext): Promise<void> {
  const legacyConnection = extensionContext.globalState.get<PersistedMCPConnection>(LEGACY_MCP_CONNECTION_KEY);
  const legacyTarget = getLegacyMCPAgent();
  if (!legacyConnection || !legacyTarget || !supportsStandaloneMCP(legacyTarget)) {
    return;
  }
  if (!extensionContext.globalState.get<PersistedMCPConnection>(mcpConnectionKey(legacyTarget))) {
    await extensionContext.globalState.update(mcpConnectionKey(legacyTarget), legacyConnection);
  }
  await extensionContext.globalState.update(LEGACY_MCP_CONNECTION_KEY, undefined);
}

function getLegacyMCPAgent(): INTEGRATION_TARGET | undefined {
  switch (getCurrentIdeHost().id) {
    case IDE_HOST.VS_CODE:
      return INTEGRATION_TARGET.GITHUB_COPILOT;
    case IDE_HOST.CURSOR:
      return INTEGRATION_TARGET.CURSOR;
    case IDE_HOST.WINDSURF:
      return INTEGRATION_TARGET.WINDSURF;
    case IDE_HOST.KIRO:
      return INTEGRATION_TARGET.KIRO;
    default:
      return undefined;
  }
}

export function hasPersistedMCPConnection(
  extensionContext: vscode.ExtensionContext,
  agent: INTEGRATION_TARGET
): boolean {
  return getPersistedConnection(extensionContext, agent) !== undefined;
}

function getPersistedConnection(
  extensionContext: vscode.ExtensionContext,
  agent: INTEGRATION_TARGET
): Connection | undefined {
  const persistedConnection = extensionContext.globalState.get<PersistedMCPConnection>(mcpConnectionKey(agent));
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

function mcpConnectionKey(agent: INTEGRATION_TARGET): string {
  return `${MCP_CONNECTION_KEY_PREFIX}${agent}`;
}

export async function openMCPServerConfigurationFile(requestedAgent?: INTEGRATION_TARGET): Promise<void> {
  const agent = await selectMCPAgent(requestedAgent);
  if (!agent) {
    return;
  }
  const configPath = getMCPConfigPath(agent);
  if (!fs.existsSync(configPath)) {
    await vscode.window.showInformationMessage(
      `The ${displayName(agent)} MCP configuration file has not been created yet.`
    );
    return;
  }
  await vscode.window.showTextDocument(vscode.Uri.file(configPath));
}

function displayName(agent: INTEGRATION_TARGET): string {
  return (
    getDetectedIdeAgents().find(detectedAgent => detectedAgent.id === agent)?.name ??
    {
      [INTEGRATION_TARGET.GITHUB_COPILOT]: 'Copilot in VS Code',
      [INTEGRATION_TARGET.CURSOR]: 'Cursor',
      [INTEGRATION_TARGET.WINDSURF]: 'Windsurf',
      [INTEGRATION_TARGET.KIRO]: 'Kiro',
      [INTEGRATION_TARGET.CLAUDE_CODE]: 'Claude Code',
      [INTEGRATION_TARGET.CODEX]: 'Codex'
    }[agent] ??
    agent
  );
}
