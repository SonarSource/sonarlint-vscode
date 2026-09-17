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
import { logToSonarLintOutput } from '../util/logging';
import { ResourceResolver } from '../util/webview';
import { AiIntegration } from '../lsp/aiIntegrationProtocol';
import { SonarLintExtendedLanguageClient } from '../lsp/client';
import { isHookInstalled } from './aiAgentHooks';
import { isSonarQubeRulesFileConfigured } from './aiAgentRuleConfig';
import {
  DetectedIdeAgent,
  getAiIntegrationStateParams,
  getCurrentAgentWithHookSupport,
  getCurrentAgentWithMCPSupport,
  getCurrentIdeHost,
  getDetectedIdeAgents
} from './aiAgentUtils';
import { getCurrentSonarQubeMCPServerConfig } from './mcpServerConfig';

const WEBVIEW_UI_DIR = 'webview-ui';
const CLI_DOCUMENTATION_URL = vscode.Uri.parse('https://docs.sonarsource.com/sonarqube-cli');
const VORTEX_DOCUMENTATION_URL = vscode.Uri.parse('https://docs.sonarsource.com/agent-centric-development-cycle/inside-your-agent-the-agentic-loop/sonar-vortex');
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

const CLI_INSTALLATION_STATUS_BY_PROTOCOL: Record<AiIntegration.CliInstallationStatus, CliInstallationStatus> = {
  [AiIntegration.CliInstallationStatus.NOT_INSTALLED]: 'NOT_INSTALLED',
  [AiIntegration.CliInstallationStatus.INSTALLED]: 'INSTALLED',
  [AiIntegration.CliInstallationStatus.UNUSABLE]: 'UNUSABLE'
};

const CLI_AUTHENTICATION_STATUS_BY_PROTOCOL: Record<AiIntegration.CliAuthenticationStatus, CliAuthenticationStatus> = {
  [AiIntegration.CliAuthenticationStatus.AUTHENTICATED]: 'AUTHENTICATED',
  [AiIntegration.CliAuthenticationStatus.UNAUTHENTICATED]: 'UNAUTHENTICATED',
  [AiIntegration.CliAuthenticationStatus.INVALID]: 'INVALID',
  [AiIntegration.CliAuthenticationStatus.UNVERIFIED]: 'UNVERIFIED',
  [AiIntegration.CliAuthenticationStatus.UNAVAILABLE]: 'UNAVAILABLE',
  [AiIntegration.CliAuthenticationStatus.UNKNOWN]: 'UNKNOWN'
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
    supported: boolean;
    configured: boolean;
    agentName?: string;
    legacyInstructionsConfigured: boolean;
  };
}

export class AIAgentsConfigurationWebviewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private resolver?: ResourceResolver;
  private activeSetupTerminal?: vscode.Terminal;
  private setupInProgress = false;

  constructor(
    private readonly extensionContext: vscode.ExtensionContext,
    private readonly languageClient: SonarLintExtendedLanguageClient
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
    webviewView.onDidDispose(
      () => {
        if (this.view === webviewView) {
          this.view = undefined;
        }
      },
      undefined,
      this.extensionContext.subscriptions
    );
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionContext.extensionUri, WEBVIEW_UI_DIR),
        vscode.Uri.joinPath(this.extensionContext.extensionUri, 'styles')
      ]
    };
    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);
    webviewView.webview.onDidReceiveMessage(
      message =>
        this.handleMessage(message).catch(error =>
          logToSonarLintOutput(`Could not handle AI integrations action '${message?.command}': ${String(error)}`)
        ),
      undefined,
      this.extensionContext.subscriptions
    );
  }

  async refresh(): Promise<void> {
    const view = this.view;
    if (!view) {
      return;
    }
    try {
      await view.webview.postMessage({ command: 'state', state: await this.buildState() });
    } catch (error) {
      logToSonarLintOutput(`Could not refresh AI integrations state: ${String(error)}`);
      if (this.view === view) {
        await view.webview.postMessage({ command: 'error' }).then(undefined, () => undefined);
      }
    }
  }

  private async buildState(): Promise<AIAgentsConfigurationState> {
    const ide = getCurrentIdeHost();
    const detectedAgents = getDetectedIdeAgents();
    const mcpAgent = getCurrentAgentWithMCPSupport();
    const hookAgent = getCurrentAgentWithHookSupport();
    const [integrationState, legacyInstructionsConfigured, hookConfigured] = await Promise.all([
      this.languageClient.getAiIntegrationState(getAiIntegrationStateParams(AiIntegration.AiIntegrationScope.GLOBAL)),
      isSonarQubeRulesFileConfigured(),
      hookAgent !== undefined ? isHookInstalled(hookAgent) : Promise.resolve(false)
    ]);
    const mcpConfigured = getCurrentSonarQubeMCPServerConfig() !== undefined;
    const cliSupportByAgent = new Map(
      integrationState.agents.map(capability => [capability.agent, capability.cliIntegrationSupported])
    );
    const agents = detectedAgents.map(agent => ({
      ...agent,
      supportsCliIntegration: cliSupportByAgent.get(agent.id) ?? false
    }));
    const mcpAgentName = agents.find(agent => agent.id === mcpAgent)?.name;

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
        supported: mcpAgent !== undefined,
        configured: mcpConfigured,
        agentName: mcpAgentName,
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
        await vscode.commands.executeCommand(Commands.CONFIGURE_MCP_SERVER);
        break;
      case 'openMcpConfiguration':
        await vscode.commands.executeCommand(Commands.OPEN_MCP_SERVER_CONFIGURATION);
        break;
      case 'openLegacyInstructions':
        await vscode.commands.executeCommand(Commands.OPEN_SONARQUBE_RULES_FILE, false);
        break;
      case 'installHook':
        await vscode.commands.executeCommand(Commands.INSTALL_AI_AGENT_HOOK_SCRIPT);
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
      state.cli.installationStatus !== AiIntegration.CliInstallationStatus.NOT_INSTALLED
    ) {
      return false;
    }
    const command = await this.languageClient.prepareInstallCliCommand();
    return this.openSetupTerminal('SonarQube CLI installation', command);
  }

  private async authenticateCli(): Promise<boolean> {
    const state = await this.getCurrentIntegrationState();
    if (
      vscode.env.remoteName !== undefined ||
      state.cli.installationStatus !== AiIntegration.CliInstallationStatus.INSTALLED ||
      (state.cli.authenticationStatus !== AiIntegration.CliAuthenticationStatus.UNAUTHENTICATED &&
        state.cli.authenticationStatus !== AiIntegration.CliAuthenticationStatus.INVALID &&
        state.cli.authenticationStatus !== AiIntegration.CliAuthenticationStatus.UNVERIFIED)
    ) {
      return false;
    }

    const connection = await this.selectConnection(state);
    if (connection === undefined && state.connectionChoices.length > 0) {
      await this.postSetupOutcome('cancelled', 'SonarQube CLI login was cancelled.');
      return false;
    }
    const params: AiIntegration.PrepareAuthenticateCliCommandParams = {};
    if (connection) {
      params.serverUrl = connection.serverUrl;
      if (connection.organization) {
        params.organization = connection.organization;
      }
    }
    const command = await this.languageClient.prepareAuthenticateCliCommand(params);
    if (!command.interactive) {
      await this.postSetupOutcome('failed', 'SonarQube CLI login must run interactively. Refresh and try again.');
      return false;
    }
    return this.openSetupTerminal('SonarQube CLI login', command);
  }

  private async integrateAgent(agentId?: string): Promise<boolean> {
    const state = await this.getCurrentIntegrationState();
    const detectedAgent = getDetectedIdeAgents().find(agent => agent.id === agentId);
    const capability = state.agents.find(agent => agent.agent === detectedAgent?.id);
    if (
      vscode.env.remoteName !== undefined ||
      state.cli.installationStatus !== AiIntegration.CliInstallationStatus.INSTALLED ||
      state.cli.authenticationStatus !== AiIntegration.CliAuthenticationStatus.AUTHENTICATED ||
      !detectedAgent ||
      !capability?.cliIntegrationSupported
    ) {
      return false;
    }

    const command = await this.languageClient.prepareIntegrateCliCommand({
      agent: detectedAgent.id
    });
    if (!command.interactive) {
      await this.postSetupOutcome('failed', 'Agent integration must run interactively. Refresh and try again.');
      return false;
    }
    return this.openSetupTerminal(`SonarQube CLI · ${detectedAgent.name}`, command);
  }

  private async getCurrentIntegrationState(): Promise<AiIntegration.GetAiIntegrationStateResponse> {
    return this.languageClient.getAiIntegrationState(
      getAiIntegrationStateParams(AiIntegration.AiIntegrationScope.GLOBAL)
    );
  }

  private async selectConnection(
    state: AiIntegration.GetAiIntegrationStateResponse
  ): Promise<AiIntegration.AiIntegrationConnection | null | undefined> {
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

  private openSetupTerminal(name: string, command: AiIntegration.PrepareCliCommandResponse): boolean {
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
