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
import { ContextManager } from '../contextManager';
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
import { Commands } from '../util/commands';
import { getVSCodeSettingsBaseDir } from '../util/util';
import {
  COPILOT_ACTIVATION_DELAY_MS,
  getAiIntegrationStateParams,
  getCurrentIdeHost,
  getDetectedIdeAgents,
  getDetectedIntegrationAgents,
  getWindsurfDirectory,
  IdeHost,
  isAgentActiveForMcp,
  toAgentDisplayName
} from './aiAgentUtils';

const LEGACY_MCP_CONNECTION_KEY = 'aiAgentsConfiguration.mcpConnection';
const MCP_CONNECTION_KEY_PREFIX = 'aiAgentsConfiguration.mcpConnection.';
const BLOCKED_CONFIGURATION_MESSAGE = 'The existing SonarQube MCP configuration cannot be updated safely.';
const WRITE_FAILED_PREFIX = 'Failed to configure SonarQube MCP Server for';
const MCP_SETUP_IN_PROGRESS_MESSAGE =
  'A SonarQube MCP configuration operation is already running. Try again in a moment.';
let mcpSetupInProgress = false;
let copilotActivationRefresh: ReturnType<typeof setTimeout> | undefined;
let embeddedServerRefreshPending = false;
let activeMcpAgent: AiIntegration.AiAgent | undefined;

const STANDALONE_MCP_CONFIG_PATHS: Partial<Record<AiIntegration.AiAgent, () => string>> = {
  [AiIntegration.AiAgent.CURSOR]: () => path.join(os.homedir(), '.cursor', 'mcp.json'),
  [AiIntegration.AiAgent.WINDSURF]: () =>
    path.join(os.homedir(), '.codeium', getWindsurfDirectory(), 'mcp_config.json'),
  [AiIntegration.AiAgent.KIRO]: () => path.join(os.homedir(), '.kiro', 'settings', 'mcp.json'),
  [AiIntegration.AiAgent.GITHUB_COPILOT]: () =>
    path.join(
      getVSCodeSettingsBaseDir(),
      vscode.env.appName.toLowerCase().includes('insiders') ? 'Code - Insiders' : 'Code',
      'User',
      'mcp.json'
    ),
  [AiIntegration.AiAgent.CLAUDE_CODE]: () => path.join(os.homedir(), '.claude.json')
};

interface PersistedMCPConnection {
  id: string;
  type: Connection['contextValue'];
}

interface McpDocument {
  agent: AiIntegration.AiAgent;
  path: string;
  content: string | null;
}

interface ResolvedMcpConnection {
  sllsConnectionId: string;
  tokenStorageKey: string;
}

export function supportsStandaloneMCP(agent: AiIntegration.AiAgent): boolean {
  return STANDALONE_MCP_CONFIG_PATHS[agent] !== undefined;
}

export function getMCPConfigPath(agent: AiIntegration.AiAgent): string {
  const resolvePath = STANDALONE_MCP_CONFIG_PATHS[agent];
  if (resolvePath === undefined) {
    throw new Error(
      `MCP setup through a configuration file is not supported for ${AiIntegration.AiAgent[agent] ?? agent}.`
    );
  }
  return resolvePath();
}

export function getActiveMcpAgent(): AiIntegration.AiAgent | undefined {
  return activeMcpAgent;
}

export function isStandaloneMcpReady(agent: AiIntegration.AiAgent): boolean {
  return supportsStandaloneMCP(agent) && isAgentActiveForMcp(agent);
}

async function refreshAiAgentsView(): Promise<void> {
  try {
    await vscode.commands.executeCommand(Commands.REFRESH_AI_AGENTS_CONFIGURATION);
  } catch (error) {
    logToSonarLintOutput(`Could not refresh the AI integrations view: ${String(error)}`);
  }
}

export async function inspectMCPConfiguration(
  languageClient: SonarLintExtendedLanguageClient,
  agent: AiIntegration.AiAgent
): Promise<AiIntegration.McpConfigurationInspectionResponse> {
  const document = readMcpDocument(agent);
  return inspectMcpDocument(languageClient, document);
}

function readMcpDocument(agent: AiIntegration.AiAgent): McpDocument {
  const configPath = getMCPConfigPath(agent);
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

function writeMcpDocument(document: McpDocument, content: string): void {
  if (readMCPConfigContent(document.path) !== document.content) {
    throw new Error('MCP configuration changed while preparing the update. Try again.');
  }
  const configDir = path.dirname(document.path);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  fs.writeFileSync(document.path, content, 'utf8');
}

export function isMCPSetupInProgress(): boolean {
  return mcpSetupInProgress;
}

export async function configureMCPServer(
  languageClient: SonarLintExtendedLanguageClient,
  allConnectionsTreeDataProvider: AllConnectionsTreeDataProvider,
  extensionContext: vscode.ExtensionContext,
  requestedAgent?: AiIntegration.AiAgent,
  connection?: Connection
): Promise<void> {
  if (vscode.env.remoteName !== undefined) {
    await vscode.window.showInformationMessage('MCP setup via configuration files is unavailable in remote windows.');
    return;
  }
  if (mcpSetupInProgress) {
    await vscode.window.showInformationMessage(MCP_SETUP_IN_PROGRESS_MESSAGE);
    return;
  }
  mcpSetupInProgress = true;
  let selectedConnection = connection;
  try {
    await migrateLegacyMCPConnection(extensionContext);
    const agent = await selectMCPAgent(languageClient, requestedAgent);
    if (agent === undefined) {
      return;
    }
    activeMcpAgent = agent;
    await refreshAiAgentsView();
    const document = readMcpDocument(agent);
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
    const currentDocument = readMcpDocument(agent);
    const updatePlan = await planMcpDocument(languageClient, currentDocument, connectionId, token ?? '');
    if (!isUpdateAllowed(updatePlan.state) || updatePlan.updatedContent == null) {
      showBlockedConfigurationMessage(updatePlan);
      return;
    }

    if (updatePlan.updatedContent !== currentDocument.content) {
      writeMcpDocument(currentDocument, updatePlan.updatedContent);
    }
    await extensionContext.globalState.update(mcpConnectionKey(agent), {
      id: connectionId,
      type: selectedConnection.contextValue
    } satisfies PersistedMCPConnection);
    openMCPServersListIfCursor(agent);

    void vscode.window
      .showInformationMessage(
        `SonarQube MCP Server configured for ${toAgentDisplayName(agent)} with "${selectedConnection.label}"`,
        'Open Configuration File'
      )
      .then(async openFile => {
        if (openFile === 'Open Configuration File') {
          await openMCPServerConfigurationFile(languageClient, agent);
        }
      });
    logToSonarLintOutput(
      `SonarQube MCP Server configured successfully for ${toAgentDisplayName(agent)} and connection: ${selectedConnection.label}`
    );
  } catch (error) {
    const connectionLabel = selectedConnection?.label ?? 'unknown connection';
    const errorMessage = `${WRITE_FAILED_PREFIX} "${connectionLabel}": ${error.message}`;
    vscode.window.showErrorMessage(errorMessage);
    logToSonarLintOutput(errorMessage);
    throw error;
  } finally {
    mcpSetupInProgress = false;
    activeMcpAgent = undefined;
    if (embeddedServerRefreshPending) {
      await onEmbeddedServerStarted(languageClient, extensionContext);
    }
  }
}

export async function getStandaloneMCPAgents(languageClient: SonarLintExtendedLanguageClient) {
  const state = await languageClient.getAiIntegrationState(
    getAiIntegrationStateParams(AiIntegration.AiIntegrationScope.GLOBAL)
  );
  const agents = getDetectedIntegrationAgents(state).filter(agent => agent.standaloneMcpSupported && isStandaloneMcpReady(agent.agent));
  ContextManager.instance.setMCPServerSupportedAgentContext(agents.length > 0);
  return agents;
}

async function selectMCPAgent(
  languageClient: SonarLintExtendedLanguageClient,
  requestedAgent?: AiIntegration.AiAgent
): Promise<AiIntegration.AiAgent | undefined> {
  const agents = await getStandaloneMCPAgents(languageClient);
  if (requestedAgent !== undefined) {
    if (!isAgentActiveForMcp(requestedAgent)) {
      await vscode.window.showInformationMessage(
        `${toAgentDisplayName(requestedAgent)} must be active before MCP can be configured.`
      );
      return undefined;
    }
    if (!agents.some(agent => agent.agent === requestedAgent)) {
      await vscode.window.showInformationMessage(
        `MCP setup through a configuration file is no longer available for ${toAgentDisplayName(requestedAgent)}.`
      );
      return undefined;
    }
    return requestedAgent;
  }

  if (agents.length === 0) {
    await vscode.window.showInformationMessage('No detected agent supports MCP setup via a configuration file.');
    return undefined;
  }
  if (agents.length === 1) {
    return agents[0].agent;
  }
  const selected = await vscode.window.showQuickPick(
    agents.map(agent => ({ label: agent.name, description: getMCPConfigPath(agent.agent), agent: agent.agent })),
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

function openMCPServersListIfCursor(agent: AiIntegration.AiAgent): void {
  if (agent === AiIntegration.AiAgent.CURSOR) {
    void vscode.commands.executeCommand('workbench.action.openMCPSettings');
  }
}

export function scheduleCopilotActivationMcpRefresh(
  languageClient: SonarLintExtendedLanguageClient,
  extensionContext: vscode.ExtensionContext
): vscode.Disposable {
  const copilot = AiIntegration.AiAgent.GITHUB_COPILOT;
  const needsRefresh = getDetectedIdeAgents().some(agent => agent.id === copilot) && !isAgentActiveForMcp(copilot);
  if (!needsRefresh || copilotActivationRefresh !== undefined) {
    return vscode.Disposable.from();
  }
  const timer = setTimeout(() => {
    copilotActivationRefresh = undefined;
    void onEmbeddedServerStarted(languageClient, extensionContext);
  }, COPILOT_ACTIVATION_DELAY_MS);
  copilotActivationRefresh = timer;
  return new vscode.Disposable(() => {
    clearTimeout(timer);
    if (copilotActivationRefresh === timer) {
      copilotActivationRefresh = undefined;
    }
  });
}

export async function onEmbeddedServerStarted(
  languageClient: SonarLintExtendedLanguageClient,
  extensionContext: vscode.ExtensionContext
): Promise<void> {
  if (mcpSetupInProgress) {
    embeddedServerRefreshPending = true;
    return;
  }
  do {
    embeddedServerRefreshPending = false;
    mcpSetupInProgress = true;
    try {
      await migrateLegacyMCPConnection(extensionContext);
      const agents = await getStandaloneMCPAgents(languageClient);
      await Promise.all(
        agents.map(agent => refreshStandaloneMCPConfiguration(agent.agent, languageClient, extensionContext))
      );
    } catch (error) {
      logToSonarLintOutput(`Could not refresh the standalone SonarQube MCP configurations: ${error.message}`);
    } finally {
      mcpSetupInProgress = false;
    }
  } while (embeddedServerRefreshPending);
  await refreshAiAgentsView();
}

async function refreshStandaloneMCPConfiguration(
  agent: AiIntegration.AiAgent,
  languageClient: SonarLintExtendedLanguageClient,
  extensionContext: vscode.ExtensionContext
): Promise<void> {
  try {
    const document = readMcpDocument(agent);
    if (document.content == null) {
      return;
    }
    const inspection = await inspectMcpDocument(languageClient, document);
    if (inspection.state !== AiIntegration.McpConfigurationState.STANDALONE) {
      return;
    }

    const connection = resolvePersistedConnection(extensionContext, agent);
    if (!connection) {
      return;
    }
    const token = await ConnectionSettingsService.instance.getServerToken(connection.tokenStorageKey);
    if (!token) {
      return;
    }
    const updatePlan = await planMcpDocument(languageClient, document, connection.sllsConnectionId, token);
    if (
      updatePlan.state === AiIntegration.McpConfigurationState.STANDALONE &&
      updatePlan.updatedContent != null &&
      updatePlan.updatedContent !== document.content
    ) {
      writeMcpDocument(document, updatePlan.updatedContent);
    }
  } catch (error) {
    logToSonarLintOutput(
      `Could not refresh the standalone SonarQube MCP configuration for ${toAgentDisplayName(agent)}: ${error.message}`
    );
  }
}

export async function migrateLegacyMCPConnection(extensionContext: vscode.ExtensionContext): Promise<void> {
  const legacyConnection = extensionContext.globalState.get<PersistedMCPConnection>(LEGACY_MCP_CONNECTION_KEY);
  const legacyTarget = getLegacyMCPAgent();
  if (!legacyConnection || legacyTarget === undefined || !supportsStandaloneMCP(legacyTarget)) {
    return;
  }
  if (!extensionContext.globalState.get<PersistedMCPConnection>(mcpConnectionKey(legacyTarget))) {
    await extensionContext.globalState.update(mcpConnectionKey(legacyTarget), legacyConnection);
  }
  await extensionContext.globalState.update(LEGACY_MCP_CONNECTION_KEY, undefined);
}

function getLegacyMCPAgent(): AiIntegration.AiAgent | undefined {
  switch (getCurrentIdeHost().id) {
    case IdeHost.VSCODE:
      return AiIntegration.AiAgent.GITHUB_COPILOT;
    case IdeHost.CURSOR:
      return AiIntegration.AiAgent.CURSOR;
    case IdeHost.WINDSURF:
      return AiIntegration.AiAgent.WINDSURF;
    case IdeHost.KIRO:
      return AiIntegration.AiAgent.KIRO;
    default:
      return undefined;
  }
}

export function hasPersistedMCPConnection(
  extensionContext: vscode.ExtensionContext,
  agent: AiIntegration.AiAgent
): boolean {
  return resolvePersistedConnection(extensionContext, agent) !== undefined;
}

function resolvePersistedConnection(
  extensionContext: vscode.ExtensionContext,
  agent: AiIntegration.AiAgent
): ResolvedMcpConnection | undefined {
  const persistedConnection = extensionContext.globalState.get<PersistedMCPConnection>(mcpConnectionKey(agent));
  if (!persistedConnection) {
    return undefined;
  }

  const settings = ConnectionSettingsService.instance;
  const candidates: Array<SonarQubeConnection | SonarCloudConnection> =
    persistedConnection.type === 'sonarqubeConnection'
      ? settings.getSonarQubeConnections()
      : settings.getSonarCloudConnections();
  const match = candidates.find(
    candidate => (candidate.connectionId || DEFAULT_CONNECTION_ID) === persistedConnection.id
  );
  if (!match) {
    return undefined;
  }
  return {
    sllsConnectionId: match.connectionId || DEFAULT_CONNECTION_ID,
    tokenStorageKey: getTokenStorageKey(match)
  };
}

function mcpConnectionKey(agent: AiIntegration.AiAgent): string {
  return `${MCP_CONNECTION_KEY_PREFIX}${agent}`;
}

export async function openMCPServerConfigurationFile(
  languageClient: SonarLintExtendedLanguageClient,
  requestedAgent?: AiIntegration.AiAgent
): Promise<void> {
  const agent = await selectMCPAgent(languageClient, requestedAgent);
  if (agent === undefined) {
    return;
  }
  const configPath = getMCPConfigPath(agent);
  if (!fs.existsSync(configPath)) {
    await vscode.window.showInformationMessage(
      `The ${toAgentDisplayName(agent)} MCP configuration file has not been created yet.`
    );
    return;
  }
  await vscode.window.showTextDocument(vscode.Uri.file(configPath));
}
