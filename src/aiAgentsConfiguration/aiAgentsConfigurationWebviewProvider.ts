/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as fs from 'node:fs';
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
import {
  canIntegrateAgent,
  CliPrimaryAction,
  CliSetupNotice,
  CliSetupSession,
  resolveCliPrimaryAction
} from './cliSetup';
import { hasPersistedMCPConnection, inspectCurrentMCPConfiguration } from './mcpServerConfig';

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
type McpConfigurationStatus = 'NOT_CONFIGURED' | 'STANDALONE' | 'CLI_MANAGED' | 'UNKNOWN' | 'MALFORMED';

const CLI_INSTALLATION_STATUS_NAMES: Record<AiIntegration.CliInstallationStatus, CliInstallationStatus> = {
  [AiIntegration.CliInstallationStatus.NOT_INSTALLED]: 'NOT_INSTALLED',
  [AiIntegration.CliInstallationStatus.INSTALLED]: 'INSTALLED',
  [AiIntegration.CliInstallationStatus.UNUSABLE]: 'UNUSABLE'
};

const CLI_AUTHENTICATION_STATUS_NAMES: Record<AiIntegration.CliAuthenticationStatus, CliAuthenticationStatus> = {
  [AiIntegration.CliAuthenticationStatus.AUTHENTICATED]: 'AUTHENTICATED',
  [AiIntegration.CliAuthenticationStatus.UNAUTHENTICATED]: 'UNAUTHENTICATED',
  [AiIntegration.CliAuthenticationStatus.INVALID]: 'INVALID',
  [AiIntegration.CliAuthenticationStatus.UNVERIFIED]: 'UNVERIFIED',
  [AiIntegration.CliAuthenticationStatus.UNAVAILABLE]: 'UNAVAILABLE',
  [AiIntegration.CliAuthenticationStatus.UNKNOWN]: 'UNKNOWN'
};

const MCP_CONFIGURATION_STATUS_BY_PROTOCOL: Record<AiIntegration.McpConfigurationState, McpConfigurationStatus> = {
  [AiIntegration.McpConfigurationState.NOT_CONFIGURED]: 'NOT_CONFIGURED',
  [AiIntegration.McpConfigurationState.STANDALONE]: 'STANDALONE',
  [AiIntegration.McpConfigurationState.CLI_MANAGED]: 'CLI_MANAGED',
  [AiIntegration.McpConfigurationState.UNKNOWN]: 'UNKNOWN',
  [AiIntegration.McpConfigurationState.MALFORMED]: 'MALFORMED'
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
    notice?: CliSetupNotice;
    primaryAction?: CliPrimaryAction;
    canIntegrate: boolean;
    hook: { supported: boolean; configured: boolean };
  };
  mcp: {
    supported: boolean;
    configurationStatus?: McpConfigurationStatus;
    diagnostic?: string;
    operationInProgress: boolean;
    requiresSetup: boolean;
    agentName?: string;
    legacyInstructionsConfigured: boolean;
  };
}

export class AIAgentsConfigurationWebviewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private resolver?: ResourceResolver;
  private cliSetupSession?: CliSetupSession;
  private mcpSetupInProgress = false;

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

  async refreshOnRequest(): Promise<void> {
    if (this.cliSetupSession) {
      this.cliSetupSession.notice = undefined;
    }
    await this.refresh();
  }

  private async buildState(): Promise<AIAgentsConfigurationState> {
    const ide = getCurrentIdeHost();
    const detectedAgents = getDetectedIdeAgents();
    const mcpAgent = getCurrentAgentWithMCPSupport();
    const hookAgent = getCurrentAgentWithHookSupport();
    const [integrationState, legacyInstructionsConfigured, hookConfigured, mcpInspection] = await Promise.all([
      this.languageClient.getAiIntegrationState(getAiIntegrationStateParams(AiIntegration.AiIntegrationScope.GLOBAL)),
      isSonarQubeRulesFileConfigured(),
      hookAgent !== undefined ? isHookInstalled(hookAgent) : Promise.resolve(false),
      mcpAgent !== undefined
        ? inspectCurrentMCPConfiguration(this.languageClient).catch(error => {
            logToSonarLintOutput(`Could not inspect MCP configuration: ${String(error)}`);
            return {
              state: AiIntegration.McpConfigurationState.UNKNOWN,
              diagnostics: ['Could not inspect the MCP configuration.']
            };
          })
        : Promise.resolve(undefined)
    ]);
    const cliSupportByAgent = new Map(
      integrationState.agents.map(capability => [capability.agent, capability.cliIntegrationSupported])
    );
    const agents = detectedAgents.map(agent => ({
      ...agent,
      supportsCliIntegration: cliSupportByAgent.get(agent.id) ?? false
    }));
    const mcpAgentName = agents.find(agent => agent.id === mcpAgent)?.name;
    const isRemote = vscode.env.remoteName !== undefined;
    const cliSetup = this.getCliSetup();
    const { installationStatus, authenticationStatus } = integrationState.cli;
    const mcpRequiresSetup =
      mcpInspection?.state === AiIntegration.McpConfigurationState.STANDALONE &&
      !hasPersistedMCPConnection(this.extensionContext);

    return {
      ideName: ide.name,
      isRemote,
      agents,
      cli: {
        installationStatus: CLI_INSTALLATION_STATUS_NAMES[installationStatus],
        authenticationStatus: CLI_AUTHENTICATION_STATUS_NAMES[authenticationStatus],
        serverUrl: integrationState.cli.serverUrl ?? undefined,
        organization: integrationState.cli.organization ?? undefined,
        operationInProgress: cliSetup.operationInProgress,
        notice: cliSetup.notice,
        primaryAction: resolveCliPrimaryAction(installationStatus, authenticationStatus, isRemote),
        canIntegrate: canIntegrateAgent(
          installationStatus,
          authenticationStatus,
          isRemote,
          cliSetup.operationInProgress
        ),
        hook: { supported: hookAgent !== undefined, configured: hookConfigured }
      },
      mcp: {
        supported: mcpAgent !== undefined,
        configurationStatus:
          mcpInspection === undefined ? undefined : MCP_CONFIGURATION_STATUS_BY_PROTOCOL[mcpInspection.state],
        diagnostic: mcpInspection?.diagnostics[0],
        operationInProgress: this.mcpSetupInProgress,
        requiresSetup: mcpRequiresSetup,
        agentName: mcpAgentName,
        legacyInstructionsConfigured
      }
    };
  }

  private async handleMessage(message: { command?: string; agent?: AiIntegration.AiAgent }): Promise<void> {
    switch (message.command) {
      case 'ready':
        await this.refresh();
        break;
      case 'refresh':
        await this.refreshOnRequest();
        break;
      case 'configureMcp':
        await this.runMcpSetup();
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
        await this.getCliSetup().run('install');
        break;
      case 'authenticateCli':
        await this.getCliSetup().run('authenticate');
        break;
      case 'integrateAgent':
        await this.getCliSetup().run('integrate', message.agent);
        break;
      case 'openVortexDocumentation':
        await vscode.env.openExternal(VORTEX_DOCUMENTATION_URL);
        break;
      case 'openMcpDocumentation':
        await vscode.env.openExternal(MCP_CONFIGURATOR_URL);
        break;
    }
  }

  private getCliSetup(): CliSetupSession {
    this.cliSetupSession ??= new CliSetupSession(this.extensionContext, this.languageClient, () => this.refresh());
    return this.cliSetupSession;
  }

  private async runMcpSetup(): Promise<void> {
    if (this.mcpSetupInProgress) {
      return;
    }
    this.mcpSetupInProgress = true;
    await this.refresh();
    try {
      await vscode.commands.executeCommand(Commands.CONFIGURE_MCP_SERVER);
    } finally {
      this.mcpSetupInProgress = false;
      await this.refresh();
    }
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
