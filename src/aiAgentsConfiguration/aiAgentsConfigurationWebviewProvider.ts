/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as vscode from 'vscode';
import * as util from '../util/util';
import { Commands } from '../util/commands';
import { ResourceResolver } from '../util/webview';
import { ExtendedServer } from '../lsp/protocol';
import { isHookInstalled } from './aiAgentHooks';
import { isSonarQubeRulesFileConfigured } from './aiAgentRuleConfig';
import {
  DetectedIdeAgent,
  getCurrentIntegrationTargetWithHookSupport,
  getCurrentIdeHost,
  getDetectedIdeAgents,
  INTEGRATION_TARGET
} from './aiAgentUtils';
import { AiIntegrationService, toProtocolAgent } from './aiIntegrationService';
import {
  getMCPConfigPath,
  hasPersistedMCPConnection,
  inspectMCPConfiguration,
  isMCPSetupInProgress,
  migrateLegacyMCPConnection,
  supportsStandaloneMCP
} from './mcpServerConfig';

const WEBVIEW_UI_DIR = 'webview-ui';
const CLI_DOCUMENTATION_URL = vscode.Uri.parse('https://www.sonarsource.com/sonarqube/cli/');
const VORTEX_DOCUMENTATION_URL = vscode.Uri.parse('https://www.sonarsource.com/blog/introducing-sonar-vortex/');
const MCP_CONFIGURATOR_URL = vscode.Uri.parse('https://mcp.sonarqube.com/');
type CliInstallationStatus = 'INSTALLED' | 'NOT_INSTALLED' | 'UNUSABLE';
type CliAuthenticationStatus =
  | 'AUTHENTICATED'
  | 'UNAUTHENTICATED'
  | 'INVALID'
  | 'UNVERIFIED'
  | 'UNAVAILABLE'
  | 'UNKNOWN';
type SetupOutcome = 'completed' | 'cancelled' | 'failed' | 'unknown';
type McpConfigurationStatus = 'NOT_CONFIGURED' | 'STANDALONE' | 'CLI_MANAGED' | 'LEGACY' | 'UNKNOWN' | 'MALFORMED';

const CLI_INSTALLATION_STATUS_BY_PROTOCOL: Record<ExtendedServer.CliInstallationStatus, CliInstallationStatus> = {
  [ExtendedServer.CliInstallationStatus.NOT_INSTALLED]: 'NOT_INSTALLED',
  [ExtendedServer.CliInstallationStatus.INSTALLED]: 'INSTALLED',
  [ExtendedServer.CliInstallationStatus.UNUSABLE]: 'UNUSABLE'
};

const CLI_AUTHENTICATION_STATUS_BY_PROTOCOL: Record<ExtendedServer.CliAuthenticationStatus, CliAuthenticationStatus> = {
  [ExtendedServer.CliAuthenticationStatus.AUTHENTICATED]: 'AUTHENTICATED',
  [ExtendedServer.CliAuthenticationStatus.UNAUTHENTICATED]: 'UNAUTHENTICATED',
  [ExtendedServer.CliAuthenticationStatus.INVALID]: 'INVALID',
  [ExtendedServer.CliAuthenticationStatus.UNVERIFIED]: 'UNVERIFIED',
  [ExtendedServer.CliAuthenticationStatus.UNAVAILABLE]: 'UNAVAILABLE',
  [ExtendedServer.CliAuthenticationStatus.UNKNOWN]: 'UNKNOWN'
};

const MCP_CONFIGURATION_STATUS_BY_PROTOCOL: Record<ExtendedServer.McpConfigurationState, McpConfigurationStatus> = {
  [ExtendedServer.McpConfigurationState.NOT_CONFIGURED]: 'NOT_CONFIGURED',
  [ExtendedServer.McpConfigurationState.STANDALONE]: 'STANDALONE',
  [ExtendedServer.McpConfigurationState.CLI_MANAGED]: 'CLI_MANAGED',
  [ExtendedServer.McpConfigurationState.LEGACY]: 'LEGACY',
  [ExtendedServer.McpConfigurationState.UNKNOWN]: 'UNKNOWN',
  [ExtendedServer.McpConfigurationState.MALFORMED]: 'MALFORMED'
};

export interface AIAgentsConfigurationState {
  ideName: string;
  isRemote: boolean;
  agents: Array<DetectedIdeAgent & { supportsCliIntegration: boolean }>;
  cli: {
    installationStatus: CliInstallationStatus;
    authenticationStatus: CliAuthenticationStatus;
    serverUrl?: string;
    organization?: string;
    operationInProgress: boolean;
    hook: { supported: boolean; configured: boolean };
  };
  mcp: {
    integrations: Array<{
      agentId: INTEGRATION_TARGET;
      agentName: string;
      standaloneSupported: boolean;
      availableThroughCli: boolean;
      configurationPath?: string;
      configurationStatus?: McpConfigurationStatus;
      diagnostic?: string;
      requiresSetup: boolean;
      operationInProgress: boolean;
    }>;
    configuredCount: number;
    configurableCount: number;
    operationInProgress: boolean;
    legacyInstructionsConfigured: boolean;
  };
}

export class AIAgentsConfigurationWebviewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private resolver?: ResourceResolver;
  private activeSetupTerminal?: vscode.Terminal;
  private setupInProgress = false;
  private mcpSetupInProgress = false;
  private activeMCPAgent?: INTEGRATION_TARGET;

  constructor(
    private readonly extensionContext: vscode.ExtensionContext,
    private readonly aiIntegrationService: AiIntegrationService
  ) {
    extensionContext.subscriptions.push(
      vscode.extensions.onDidChange(() => this.refresh()),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.refresh())
    );
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionContext.extensionUri, WEBVIEW_UI_DIR),
        vscode.Uri.joinPath(this.extensionContext.extensionUri, 'styles')
      ]
    };
    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);
    webviewView.webview.onDidReceiveMessage(
      message => this.handleMessage(message),
      undefined,
      this.extensionContext.subscriptions
    );
  }

  async refresh(): Promise<void> {
    if (!this.view) {
      return;
    }
    try {
      await this.view.webview.postMessage({ command: 'state', state: await this.buildState() });
    } catch {
      await this.view.webview.postMessage({ command: 'error' });
    }
  }

  private async buildState(): Promise<AIAgentsConfigurationState> {
    const ide = getCurrentIdeHost();
    const detectedAgents = getDetectedIdeAgents();
    const hookAgent = getCurrentIntegrationTargetWithHookSupport();
    await migrateLegacyMCPConnection(this.extensionContext);
    const [integrationState, legacyInstructionsConfigured, hookConfigured] = await Promise.all([
      this.aiIntegrationService.getIntegrationState(
        ide.id,
        detectedAgents.map(agent => agent.id),
        ExtendedServer.AiIntegrationScope.GLOBAL
      ),
      isSonarQubeRulesFileConfigured(),
      hookAgent ? isHookInstalled(hookAgent) : Promise.resolve(false)
    ]);
    const capabilitiesByAgent = new Map(integrationState.agents.map(capability => [capability.agent, capability]));
    const inspections = await Promise.all(
      detectedAgents
        .filter(
          agent =>
            supportsStandaloneMCP(agent.id) &&
            capabilitiesByAgent.get(toProtocolAgent(agent.id))?.standaloneMcpSupported
        )
        .map(async agent => {
          try {
            return { agent: agent.id, inspection: await inspectMCPConfiguration(agent.id, this.aiIntegrationService) };
          } catch (error) {
            return {
              agent: agent.id,
              inspection: {
                state: ExtendedServer.McpConfigurationState.UNKNOWN,
                diagnostics: [`Could not inspect ${agent.name} MCP configuration: ${error.message}`]
              }
            };
          }
        })
    );
    const agents = detectedAgents.map(agent => ({
      ...agent,
      supportsCliIntegration: capabilitiesByAgent.get(toProtocolAgent(agent.id))?.cliIntegrationSupported ?? false
    }));
    const inspectionByAgent = new Map(inspections.map(result => [result.agent, result.inspection]));
    const mcpOperationInProgress = this.mcpSetupInProgress || isMCPSetupInProgress();
    const mcpIntegrations = detectedAgents.map(agent => {
      const jsonConfigurationSupported = supportsStandaloneMCP(agent.id);
      const inspection = inspectionByAgent.get(agent.id);
      const standaloneSupported =
        jsonConfigurationSupported &&
        (capabilitiesByAgent.get(toProtocolAgent(agent.id))?.standaloneMcpSupported ?? false);
      return {
        agentId: agent.id,
        agentName: agent.name,
        standaloneSupported,
        availableThroughCli: agent.id === INTEGRATION_TARGET.CODEX,
        configurationPath: jsonConfigurationSupported ? getMCPConfigPath(agent.id) : undefined,
        configurationStatus:
          inspection === undefined ? undefined : MCP_CONFIGURATION_STATUS_BY_PROTOCOL[inspection.state],
        diagnostic: inspection?.diagnostics[0],
        requiresSetup:
          inspection?.state === ExtendedServer.McpConfigurationState.STANDALONE &&
          !hasPersistedMCPConnection(this.extensionContext, agent.id),
        operationInProgress: mcpOperationInProgress && this.activeMCPAgent === agent.id
      };
    });
    const configurableIntegrations = mcpIntegrations.filter(integration => integration.standaloneSupported);
    const configuredCount = configurableIntegrations.filter(integration =>
      ['STANDALONE', 'CLI_MANAGED'].includes(integration.configurationStatus)
    ).length;

    return {
      ideName: ide.name,
      isRemote: vscode.env.remoteName !== undefined,
      agents,
      cli: {
        installationStatus: CLI_INSTALLATION_STATUS_BY_PROTOCOL[integrationState.cli.installationStatus],
        authenticationStatus: CLI_AUTHENTICATION_STATUS_BY_PROTOCOL[integrationState.cli.authenticationStatus],
        serverUrl: integrationState.cli.serverUrl ?? undefined,
        organization: integrationState.cli.organization ?? undefined,
        operationInProgress: this.setupInProgress,
        hook: { supported: hookAgent !== undefined, configured: hookConfigured }
      },
      mcp: {
        integrations: mcpIntegrations,
        configuredCount,
        configurableCount: configurableIntegrations.length,
        operationInProgress: mcpOperationInProgress,
        legacyInstructionsConfigured
      }
    };
  }

  private async handleMessage(message: { command?: string; agent?: string }): Promise<void> {
    switch (message.command) {
      case 'ready':
      case 'refresh':
        await this.refresh();
        break;
      case 'configureMcp':
        await this.runMcpSetup(message.agent);
        break;
      case 'openMcpConfiguration':
        await vscode.commands.executeCommand(Commands.OPEN_MCP_SERVER_CONFIGURATION, message.agent);
        break;
      case 'openLegacyInstructions':
        await vscode.commands.executeCommand(Commands.OPEN_SONARQUBE_RULES_FILE, false);
        await this.refresh();
        break;
      case 'installHook':
        await vscode.commands.executeCommand(Commands.INSTALL_AI_AGENT_HOOK_SCRIPT);
        await this.refresh();
        break;
      case 'openHook':
        await vscode.commands.executeCommand(Commands.OPEN_AI_AGENT_HOOK_CONFIGURATION);
        break;
      case 'openCliDocumentation':
        await vscode.env.openExternal(CLI_DOCUMENTATION_URL);
        break;
      case 'installCli':
        await this.runCliSetup(() => this.installCli());
        break;
      case 'authenticateCli':
        await this.runCliSetup(() => this.authenticateCli());
        break;
      case 'integrateAgent':
        await this.runCliSetup(() => this.integrateAgent(message.agent));
        break;
      case 'openVortexDocumentation':
        await vscode.env.openExternal(VORTEX_DOCUMENTATION_URL);
        break;
      case 'openMcpDocumentation':
        await vscode.env.openExternal(MCP_CONFIGURATOR_URL);
        break;
    }
  }

  private async runMcpSetup(agentId?: string): Promise<void> {
    if (this.mcpSetupInProgress) {
      return;
    }
    const agent = getDetectedIdeAgents().find(detectedAgent => detectedAgent.id === agentId)?.id;
    if (!agent || !supportsStandaloneMCP(agent)) {
      return;
    }
    this.mcpSetupInProgress = true;
    this.activeMCPAgent = agent;
    await this.refresh();
    try {
      await vscode.commands.executeCommand(Commands.CONFIGURE_MCP_SERVER, agent);
    } finally {
      this.mcpSetupInProgress = false;
      this.activeMCPAgent = undefined;
      await this.refresh();
    }
  }

  private async runCliSetup(setup: () => Promise<boolean>): Promise<void> {
    if (this.setupInProgress) {
      this.activeSetupTerminal?.show();
      return;
    }

    this.setupInProgress = true;
    await this.refresh();
    let terminalStarted = false;
    try {
      terminalStarted = await setup();
    } catch {
      await this.postSetupOutcome('failed', 'Could not start SonarQube CLI setup. Try again.');
    } finally {
      if (!terminalStarted) {
        this.setupInProgress = false;
        await this.refresh();
      }
    }
  }

  private async installCli(): Promise<boolean> {
    const state = await this.getCurrentIntegrationState();
    if (
      vscode.env.remoteName !== undefined ||
      state.cli.installationStatus !== ExtendedServer.CliInstallationStatus.NOT_INSTALLED
    ) {
      return false;
    }
    const command = await this.aiIntegrationService.prepareCliCommand({
      action: ExtendedServer.CliCommandAction.INSTALL
    });
    return this.openSetupTerminal('SonarQube CLI installation', command);
  }

  private async authenticateCli(): Promise<boolean> {
    const state = await this.getCurrentIntegrationState();
    if (
      vscode.env.remoteName !== undefined ||
      state.cli.installationStatus !== ExtendedServer.CliInstallationStatus.INSTALLED ||
      (state.cli.authenticationStatus !== ExtendedServer.CliAuthenticationStatus.UNAUTHENTICATED &&
        state.cli.authenticationStatus !== ExtendedServer.CliAuthenticationStatus.INVALID &&
        state.cli.authenticationStatus !== ExtendedServer.CliAuthenticationStatus.UNVERIFIED)
    ) {
      return false;
    }

    const connection = await this.selectConnection(state);
    if (connection === undefined && state.connectionChoices.length > 0) {
      await this.postSetupOutcome('cancelled', 'SonarQube CLI login was cancelled.');
      return false;
    }
    const params: ExtendedServer.PrepareCliCommandParams = {
      action: ExtendedServer.CliCommandAction.AUTHENTICATE
    };
    if (connection) {
      params.serverUrl = connection.serverUrl;
      if (connection.organization) {
        params.organization = connection.organization;
      }
    }
    const command = await this.aiIntegrationService.prepareCliCommand(params);
    if (!command.interactive) {
      await this.postSetupOutcome('failed', 'SonarQube CLI login must run interactively. Refresh and try again.');
      return false;
    }
    return this.openSetupTerminal('SonarQube CLI login', command);
  }

  private async integrateAgent(agentId?: string): Promise<boolean> {
    const state = await this.getCurrentIntegrationState();
    const detectedAgent = getDetectedIdeAgents().find(agent => agent.id === agentId);
    const capability = state.agents.find(agent => agent.agent === (detectedAgent && toProtocolAgent(detectedAgent.id)));
    if (
      vscode.env.remoteName !== undefined ||
      state.cli.installationStatus !== ExtendedServer.CliInstallationStatus.INSTALLED ||
      state.cli.authenticationStatus !== ExtendedServer.CliAuthenticationStatus.AUTHENTICATED ||
      !detectedAgent ||
      !capability?.cliIntegrationSupported
    ) {
      return false;
    }

    const command = await this.aiIntegrationService.prepareCliCommand({
      action: ExtendedServer.CliCommandAction.INTEGRATE,
      agent: toProtocolAgent(detectedAgent.id)
    });
    if (!command.interactive) {
      await this.postSetupOutcome('failed', 'Agent integration must run interactively. Refresh and try again.');
      return false;
    }
    return this.openSetupTerminal(`SonarQube CLI · ${detectedAgent.name}`, command);
  }

  private async getCurrentIntegrationState(): Promise<ExtendedServer.GetAiIntegrationStateResponse> {
    const ide = getCurrentIdeHost();
    return this.aiIntegrationService.getIntegrationState(
      ide.id,
      getDetectedIdeAgents().map(agent => agent.id),
      ExtendedServer.AiIntegrationScope.GLOBAL
    );
  }

  private async selectConnection(
    state: ExtendedServer.GetAiIntegrationStateResponse
  ): Promise<ExtendedServer.AiIntegrationConnection | null | undefined> {
    if (state.recommendedConnectionId) {
      const recommended = state.connectionChoices.find(
        connection => connection.connectionId === state.recommendedConnectionId
      );
      if (recommended) {
        return recommended;
      }
    }
    if (state.connectionChoices.length === 0) {
      return null;
    }
    if (state.connectionChoices.length === 1) {
      return state.connectionChoices[0];
    }
    const selection = await vscode.window.showQuickPick(
      state.connectionChoices.map(connection => ({
        label: connection.organization ?? connection.serverUrl,
        description: connection.organization ? connection.serverUrl : undefined,
        connection
      })),
      { placeHolder: 'Choose a SonarQube connection for CLI login' }
    );
    return selection?.connection;
  }

  private openSetupTerminal(name: string, command: ExtendedServer.PrepareCliCommandResponse): boolean {
    const terminal = vscode.window.createTerminal({
      name,
      shellPath: command.executable,
      shellArgs: command.arguments,
      cwd: os.homedir()
    });
    this.activeSetupTerminal = terminal;
    const closeListener = vscode.window.onDidCloseTerminal(closedTerminal => {
      if (closedTerminal !== terminal) {
        return;
      }
      closeListener.dispose();
      this.activeSetupTerminal = undefined;
      this.setupInProgress = false;
      void this.handleSetupTerminalClosed(closedTerminal.exitStatus);
    });
    this.extensionContext.subscriptions.push(closeListener);
    terminal.show();
    return true;
  }

  private async handleSetupTerminalClosed(exitStatus?: vscode.TerminalExitStatus): Promise<void> {
    await this.refresh();
    if (exitStatus?.reason === vscode.TerminalExitReason.User) {
      await this.postSetupOutcome('cancelled', 'SonarQube CLI setup was cancelled.');
    } else if (exitStatus?.code === 0) {
      await this.postSetupOutcome('completed', 'The CLI command finished. Setup state has been refreshed.');
    } else if (exitStatus?.code === undefined) {
      await this.postSetupOutcome(
        'unknown',
        'The terminal closed without a reliable result. Refresh to check setup state.'
      );
    } else {
      await this.postSetupOutcome('failed', 'The CLI command failed. Review the terminal output and try again.');
    }
  }

  private async postSetupOutcome(outcome: SetupOutcome, message: string): Promise<void> {
    await this.view?.webview.postMessage({ command: 'setupOutcome', outcome, message });
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    this.resolver = new ResourceResolver(this.extensionContext, webview);
    const templatePath = util.resolveExtensionFile(WEBVIEW_UI_DIR, 'aiAgentsConfiguration.html');
    const template = fs.readFileSync(templatePath.fsPath, 'utf-8');
    return template
      .replaceAll('{{cspSource}}', webview.cspSource)
      .replace('{{styleSrc}}', this.resolver.resolve('styles', 'aiAgentsConfiguration.css'))
      .replace('{{scriptSrc}}', this.resolver.resolve(WEBVIEW_UI_DIR, 'aiAgentsConfiguration.js'));
  }
}
