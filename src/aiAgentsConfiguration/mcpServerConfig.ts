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
import { ConnectionSettingsService } from '../settings/connectionsettings';
import { logToSonarLintOutput } from '../util/logging';
import { Commands } from '../util/commands';
import { extensionContext, getVSCodeSettingsBaseDir } from '../util/util';
import {
  COPILOT_ACTIVATION_DELAY_MS,
  getAiIntegrationStateParams,
  getDetectedIdeAgents,
  getDetectedIntegrationAgents,
  getWindsurfDirectory,
  isAgentActiveForMcp,
  toAgentDisplayName
} from './aiAgentUtils';

const BLOCKED_CONFIGURATION_MESSAGE = 'The existing SonarQube MCP configuration cannot be updated safely.';
const WRITE_FAILED_PREFIX = 'Failed to configure SonarQube MCP Server for';
const MAX_TCP_PORT = 65_535;
const MCP_SETUP_IN_PROGRESS_MESSAGE =
  'A SonarQube MCP configuration operation is already running. Try again in a moment.';
let mcpSetupInProgress = false;
let copilotActivationRefresh: ReturnType<typeof setTimeout> | undefined;
let embeddedServerRefreshPending = false;
let embeddedServerRefreshTask: Promise<void> | undefined;
let embeddedServerPort: number | undefined;
let activeMcpAgent: AiIntegration.AiAgent | undefined;

const STANDALONE_MCP_CONFIG_PATHS: Partial<Record<AiIntegration.AiAgent, () => string>> = {
  [AiIntegration.AiAgent.CURSOR]: () => path.join(os.homedir(), '.cursor', 'mcp.json'),
  [AiIntegration.AiAgent.WINDSURF]: () =>
    path.join(os.homedir(), '.codeium', getWindsurfDirectory(), 'mcp_config.json'),
  [AiIntegration.AiAgent.KIRO]: () => path.join(os.homedir(), '.kiro', 'settings', 'mcp.json'),
  [AiIntegration.AiAgent.GITHUB_COPILOT]: () =>
    vscode.env.remoteName === undefined
      ? path.join(
          getVSCodeSettingsBaseDir(),
          vscode.env.appName.toLowerCase().includes('insiders') ? 'Code - Insiders' : 'Code',
          'User',
          'mcp.json'
        )
      : getRemoteUserMcpConfigPath(),
  [AiIntegration.AiAgent.CLAUDE_CODE]: () => path.join(os.homedir(), '.claude.json')
};

// In remote windows, VS Code reads MCP servers from the remote user data folder, which also holds our global storage
function getRemoteUserMcpConfigPath(): string {
  return path.join(extensionContext.globalStorageUri.fsPath, '..', '..', 'mcp.json');
}

interface McpDocument {
  agent: AiIntegration.AiAgent;
  path: string;
  content: string | null;
}

type McpAgentSelection =
  { kind: 'selected'; agent: AiIntegration.AiAgent } | { kind: 'cancelled' } | { kind: 'unsupported' };

type McpConnectionSelection =
  { kind: 'selected'; connection: Connection } | { kind: 'cancelled' } | { kind: 'unavailable' };

// Protocol type, not the telemetry module: MCP setup returns a result and the command reports it.
type AiIntegrationOutcome = AiIntegration.AiIntegrationOutcome;

type McpUpdatePreparation =
  | {
      kind: 'ready';
      document: McpDocument;
      updatePlan: AiIntegration.McpConfigurationUpdatePlanResponse;
      successMessage: string;
    }
  | { kind: 'finished'; outcome: AiIntegrationOutcome };

function mcpFailed(agent?: AiIntegration.AiAgent): AiIntegrationOutcome {
  return { status: AiIntegration.AiIntegrationActionStatus.FAILED, agent };
}

function mcpCancelled(agent?: AiIntegration.AiAgent): AiIntegrationOutcome {
  return { status: AiIntegration.AiIntegrationActionStatus.CANCELLED, agent };
}

function unselectedMcpAgentOutcome(
  selection: { kind: 'cancelled' } | { kind: 'unsupported' },
  requestedAgent?: AiIntegration.AiAgent
): AiIntegrationOutcome {
  return selection.kind === 'cancelled' ? mcpCancelled(requestedAgent) : mcpFailed(requestedAgent);
}

function unselectedMcpConnectionOutcome(
  selection: { kind: 'cancelled' } | { kind: 'unavailable' },
  agent: AiIntegration.AiAgent
): AiIntegrationOutcome {
  return selection.kind === 'cancelled' ? mcpCancelled(agent) : mcpFailed(agent);
}

async function resolveMcpToken(connection: Connection) {
  const token = await ConnectionSettingsService.instance.getTokenForConnection(connection);
  if (token) {
    return { token, cancelled: false };
  }
  const proceed = await vscode.window.showWarningMessage(
    `The SonarQube connection "${connection.label}" doesn't have a token configured. The MCP server will be created but may not function properly without a valid token.`,
    'Proceed Anyway',
    'Cancel'
  );
  return { token, cancelled: proceed !== 'Proceed Anyway' };
}

async function refreshPendingMcpSetup(languageClient: SonarLintExtendedLanguageClient): Promise<void> {
  if (!embeddedServerRefreshPending) {
    return;
  }
  try {
    await onEmbeddedServerStarted(languageClient);
  } catch {
    logToSonarLintOutput('Could not refresh standalone MCP configurations after setup.');
  }
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

function planMcpPortUpdate(
  languageClient: SonarLintExtendedLanguageClient,
  document: McpDocument,
  port: number
): Promise<AiIntegration.McpConfigurationUpdatePlanResponse> {
  return languageClient.planMcpConfigurationUpdate({
    agent: document.agent,
    content: document.content,
    sonarMcpConfiguration: JSON.stringify({ env: { SONARQUBE_IDE_PORT: String(port) } })
  });
}

async function prepareMcpUpdate(
  languageClient: SonarLintExtendedLanguageClient,
  allConnectionsTreeDataProvider: AllConnectionsTreeDataProvider,
  document: McpDocument,
  state: AiIntegration.McpConfigurationState,
  connection?: Connection
): Promise<McpUpdatePreparation> {
  const agent = document.agent;
  if (state === AiIntegration.McpConfigurationState.STANDALONE) {
    if (embeddedServerPort === undefined) {
      await vscode.window.showErrorMessage('The IDE connection is unavailable. Restart the IDE and try again.');
      return { kind: 'finished', outcome: mcpFailed(agent) };
    }
    const updatePlan = await planMcpPortUpdate(languageClient, document, embeddedServerPort);
    if (updatePlan.state !== AiIntegration.McpConfigurationState.STANDALONE) {
      showBlockedConfigurationMessage(updatePlan);
      return { kind: 'finished', outcome: mcpFailed(agent) };
    }
    const successMessage = updatePlan.updatedContent === document.content
      ? `SonarQube MCP IDE port is already up to date for ${toAgentDisplayName(agent)}.`
      : `SonarQube MCP IDE port updated for ${toAgentDisplayName(agent)}. Your server settings were preserved.`;
    return { kind: 'ready', document, updatePlan, successMessage };
  }

  const connectionSelection = await getSelectedConnection(allConnectionsTreeDataProvider, connection);
  if (connectionSelection.kind !== 'selected') {
    return { kind: 'finished', outcome: unselectedMcpConnectionOutcome(connectionSelection, agent) };
  }
  const selectedConnection = connectionSelection.connection;
  const tokenSelection = await resolveMcpToken(selectedConnection);
  if (tokenSelection.cancelled) {
    return { kind: 'finished', outcome: mcpCancelled(agent) };
  }
  const currentDocument = readMcpDocument(agent);
  const updatePlan = await planMcpDocument(
    languageClient,
    currentDocument,
    selectedConnection.id || DEFAULT_CONNECTION_ID,
    tokenSelection.token ?? ''
  );
  if (updatePlan.state !== AiIntegration.McpConfigurationState.NOT_CONFIGURED) {
    showBlockedConfigurationMessage(updatePlan);
    return { kind: 'finished', outcome: mcpFailed(agent) };
  }
  const successMessage = `SonarQube MCP Server configured for ${toAgentDisplayName(agent)} with "${selectedConnection.label}"`;
  return { kind: 'ready', document: currentDocument, updatePlan, successMessage };
}

function writeMcpDocument(document: McpDocument, content: string): void {
  if (readMCPConfigContent(document.path) !== document.content) {
    throw new Error('MCP configuration changed while preparing the update. Try again.');
  }
  fs.mkdirSync(path.dirname(document.path), { recursive: true });
  fs.writeFileSync(document.path, content, 'utf8');
}

export function isMCPSetupInProgress(): boolean {
  return mcpSetupInProgress;
}

export async function configureMCPServer(
  languageClient: SonarLintExtendedLanguageClient,
  allConnectionsTreeDataProvider: AllConnectionsTreeDataProvider,
  requestedAgent?: AiIntegration.AiAgent,
  connection?: Connection
): Promise<AiIntegrationOutcome> {
  if (mcpSetupInProgress) {
    await vscode.window.showInformationMessage(MCP_SETUP_IN_PROGRESS_MESSAGE);
    return mcpCancelled(requestedAgent);
  }
  mcpSetupInProgress = true;
  let selectedAgent = requestedAgent;
  try {
    const selection = await selectMCPAgent(languageClient, requestedAgent);
    if (selection.kind !== 'selected') {
      return unselectedMcpAgentOutcome(selection, requestedAgent);
    }
    const agent = selection.agent;
    selectedAgent = agent;
    activeMcpAgent = agent;
    await refreshAiAgentsView();
    const document = readMcpDocument(agent);
    const inspection = await inspectMcpDocument(languageClient, document);
    if (!isUpdateAllowed(inspection.state)) {
      showBlockedConfigurationMessage(inspection);
      return mcpFailed(agent);
    }

    const preparation = await prepareMcpUpdate(
      languageClient,
      allConnectionsTreeDataProvider,
      document,
      inspection.state,
      connection
    );
    if (preparation.kind === 'finished') {
      return preparation.outcome;
    }
    const { document: currentDocument, updatePlan, successMessage } = preparation;
    if (updatePlan.updatedContent == null) {
      showBlockedConfigurationMessage(updatePlan);
      return mcpFailed(agent);
    }
    if (updatePlan.updatedContent !== currentDocument.content) {
      writeMcpDocument(currentDocument, updatePlan.updatedContent);
    }
    openMCPServersListIfCursor(agent);

    void vscode.window
      .showInformationMessage(successMessage, 'Open Configuration File')
      .then(async openFile => {
        if (openFile === 'Open Configuration File') {
          await vscode.commands.executeCommand(Commands.OPEN_MCP_SERVER_CONFIGURATION, agent);
        }
      });
    logToSonarLintOutput(successMessage);
    return { status: AiIntegration.AiIntegrationActionStatus.SUCCEEDED, agent };
  } catch (error) {
    const target = selectedAgent === undefined ? 'the selected agent' : toAgentDisplayName(selectedAgent);
    const errorMessage = `${WRITE_FAILED_PREFIX} ${target}: ${error.message}`;
    vscode.window.showErrorMessage(errorMessage);
    logToSonarLintOutput(errorMessage);
    return mcpFailed(selectedAgent);
  } finally {
    mcpSetupInProgress = false;
    activeMcpAgent = undefined;
    await refreshPendingMcpSetup(languageClient);
  }
}

export async function getStandaloneMCPAgents(languageClient: SonarLintExtendedLanguageClient) {
  const state = await languageClient.getAiIntegrationState(
    getAiIntegrationStateParams(AiIntegration.AiIntegrationScope.GLOBAL)
  );
  const agents = getDetectedIntegrationAgents(state).filter(
    agent => agent.standaloneMcpSupported && isStandaloneMcpReady(agent.agent)
  );
  ContextManager.instance.setMCPServerSupportedAgentContext(agents.length > 0);
  return agents;
}

async function selectMCPAgent(
  languageClient: SonarLintExtendedLanguageClient,
  requestedAgent?: AiIntegration.AiAgent
): Promise<McpAgentSelection> {
  const agents = await getStandaloneMCPAgents(languageClient);
  if (requestedAgent !== undefined) {
    if (!isAgentActiveForMcp(requestedAgent)) {
      await vscode.window.showInformationMessage(
        `${toAgentDisplayName(requestedAgent)} must be active before MCP can be configured.`
      );
      return { kind: 'unsupported' };
    }
    if (!agents.some(agent => agent.agent === requestedAgent)) {
      await vscode.window.showInformationMessage(
        `MCP setup through a configuration file is no longer available for ${toAgentDisplayName(requestedAgent)}.`
      );
      return { kind: 'unsupported' };
    }
    return { kind: 'selected', agent: requestedAgent };
  }

  if (agents.length === 0) {
    await vscode.window.showInformationMessage('No detected agent supports MCP setup via a configuration file.');
    return { kind: 'unsupported' };
  }
  if (agents.length === 1) {
    return { kind: 'selected', agent: agents[0].agent };
  }
  const selected = await vscode.window.showQuickPick(
    agents.map(agent => ({ label: agent.name, description: getMCPConfigPath(agent.agent), agent: agent.agent })),
    { placeHolder: 'Choose an agent to configure with SonarQube MCP' }
  );
  return selected ? { kind: 'selected', agent: selected.agent } : { kind: 'cancelled' };
}

async function getSelectedConnection(
  allConnectionsTreeDataProvider: AllConnectionsTreeDataProvider,
  connection?: Connection
): Promise<McpConnectionSelection> {
  if (connection) {
    return { kind: 'selected', connection };
  }

  const allConnections = [
    ...(await allConnectionsTreeDataProvider.getConnections('__sonarqube__')),
    ...(await allConnectionsTreeDataProvider.getConnections('__sonarcloud__'))
  ];
  if (allConnections.length === 0) {
    warnNoConnectionConfigured();
    return { kind: 'unavailable' };
  }
  if (allConnections.length === 1) {
    return { kind: 'selected', connection: allConnections[0] };
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
  return selectedItem ? { kind: 'selected', connection: selectedItem.connection } : { kind: 'cancelled' };
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
  languageClient: SonarLintExtendedLanguageClient
): vscode.Disposable {
  const copilot = AiIntegration.AiAgent.GITHUB_COPILOT;
  const needsRefresh = getDetectedIdeAgents().some(agent => agent.id === copilot) && !isAgentActiveForMcp(copilot);
  if (!needsRefresh || copilotActivationRefresh !== undefined) {
    return vscode.Disposable.from();
  }
  const timer = setTimeout(() => {
    copilotActivationRefresh = undefined;
    void onEmbeddedServerStarted(languageClient);
  }, COPILOT_ACTIVATION_DELAY_MS);
  copilotActivationRefresh = timer;
  return new vscode.Disposable(() => {
    clearTimeout(timer);
    if (copilotActivationRefresh === timer) {
      copilotActivationRefresh = undefined;
    }
  });
}

async function runEmbeddedServerRefreshPass(languageClient: SonarLintExtendedLanguageClient): Promise<void> {
  embeddedServerRefreshPending = false;
  const port = embeddedServerPort;
  if (port === undefined) {
    return;
  }
  mcpSetupInProgress = true;
  try {
    const agents = await getStandaloneMCPAgents(languageClient);
    await Promise.all(
      agents.map(agent => refreshStandaloneMCPConfiguration(agent.agent, languageClient, port))
    );
  } catch (error) {
    logToSonarLintOutput(`Could not refresh the standalone SonarQube MCP configurations: ${error.message}`);
  } finally {
    mcpSetupInProgress = false;
  }
}

async function runEmbeddedServerRefreshPasses(languageClient: SonarLintExtendedLanguageClient): Promise<void> {
  await runEmbeddedServerRefreshPass(languageClient);
  if (embeddedServerRefreshPending) {
    return runEmbeddedServerRefreshPasses(languageClient);
  }
  return refreshAiAgentsView();
}

export function onEmbeddedServerStarted(
  languageClient: SonarLintExtendedLanguageClient,
  port?: number
): Promise<void> {
  if (port !== undefined) {
    if (!Number.isInteger(port) || port < 1 || port > MAX_TCP_PORT) {
      embeddedServerPort = undefined;
      return Promise.resolve();
    }
    embeddedServerPort = port;
  }
  if (mcpSetupInProgress) {
    embeddedServerRefreshPending = true;
    return embeddedServerRefreshTask ?? Promise.resolve();
  }
  const task = runEmbeddedServerRefreshPasses(languageClient).finally(() => {
    if (embeddedServerRefreshTask === task) {
      embeddedServerRefreshTask = undefined;
    }
  });
  embeddedServerRefreshTask = task;
  return task;
}

async function refreshStandaloneMCPConfiguration(
  agent: AiIntegration.AiAgent,
  languageClient: SonarLintExtendedLanguageClient,
  port: number
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
    const updatePlan = await planMcpPortUpdate(languageClient, document, port);
    if (
      embeddedServerPort === port &&
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

export async function openMCPServerConfigurationFile(
  languageClient: SonarLintExtendedLanguageClient,
  requestedAgent?: AiIntegration.AiAgent
): Promise<AiIntegrationOutcome> {
  try {
    const selection = await selectMCPAgent(languageClient, requestedAgent);
    if (selection.kind !== 'selected') {
      return unselectedMcpAgentOutcome(selection, requestedAgent);
    }
    const agent = selection.agent;
    const configPath = getMCPConfigPath(agent);
    if (!fs.existsSync(configPath)) {
      await vscode.window.showInformationMessage(
        `The ${toAgentDisplayName(agent)} MCP configuration file has not been created yet.`
      );
      return mcpFailed(agent);
    }
    await vscode.window.showTextDocument(vscode.Uri.file(configPath));
    return { status: AiIntegration.AiIntegrationActionStatus.SUCCEEDED, agent };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const message = `Could not open the SonarQube MCP configuration file: ${detail}`;
    logToSonarLintOutput(message);
    void vscode.window.showErrorMessage(message);
    return mcpFailed(requestedAgent);
  }
}
