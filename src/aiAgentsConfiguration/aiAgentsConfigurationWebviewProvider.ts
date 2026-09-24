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
    integrations: Array<{
      agentId: AiIntegration.AiAgent;
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
  private cliSetupSession?: CliSetupSession;
  private mcpSetupInProgress = false;
  private activeMCPAgent?: AiIntegration.AiAgent;

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
    const hookAgent = getCurrentAgentWithHookSupport();
    await migrateLegacyMCPConnection(this.extensionContext);
    const [integrationState, legacyInstructionsConfigured, hookConfigured] = await Promise.all([
      this.languageClient.getAiIntegrationState(getAiIntegrationStateParams(AiIntegration.AiIntegrationScope.GLOBAL)),
      isSonarQubeRulesFileConfigured(),
      hookAgent !== undefined ? isHookInstalled(hookAgent) : Promise.resolve(false)
    ]);
    const capabilitiesByAgent = new Map(integrationState.agents.map(capability => [capability.agent, capability]));
    const inspections = await Promise.all(
      detectedAgents
        .filter(
          agent => supportsStandaloneMCP(agent.id) && capabilitiesByAgent.get(agent.id)?.standaloneMcpSupported === true
        )
        .map(async agent => {
          try {
            return { agent: agent.id, inspection: await inspectMCPConfiguration(this.languageClient, agent.id) };
          } catch (error) {
            logToSonarLintOutput(`Could not inspect ${agent.name} MCP configuration: ${String(error)}`);
            return {
              agent: agent.id,
              inspection: {
                state: AiIntegration.McpConfigurationState.UNKNOWN,
                diagnostics: [`Could not inspect ${agent.name} MCP configuration.`]
              }
            };
          }
        })
    );
    const agents = detectedAgents.map(agent => ({
      ...agent,
      supportsCliIntegration: capabilitiesByAgent.get(agent.id)?.cliIntegrationSupported ?? false
    }));
    const isRemote = vscode.env.remoteName !== undefined;
    const cliSetup = this.getCliSetup();
    const { installationStatus, authenticationStatus } = integrationState.cli;
    const inspectionByAgent = new Map(inspections.map(result => [result.agent, result.inspection]));
    const mcpOperationInProgress = this.mcpSetupInProgress || isMCPSetupInProgress();
    const mcpIntegrations = detectedAgents.map(agent => {
      const jsonConfigurationSupported = supportsStandaloneMCP(agent.id);
      const inspection = inspectionByAgent.get(agent.id);
      const standaloneSupported =
        jsonConfigurationSupported && capabilitiesByAgent.get(agent.id)?.standaloneMcpSupported === true;
      return {
        agentId: agent.id,
        agentName: agent.name,
        standaloneSupported,
        availableThroughCli: agent.id === AiIntegration.AiAgent.CODEX,
        configurationPath: jsonConfigurationSupported ? getMCPConfigPath(agent.id) : undefined,
        configurationStatus:
          inspection === undefined ? undefined : MCP_CONFIGURATION_STATUS_BY_PROTOCOL[inspection.state],
        diagnostic: inspection?.diagnostics[0],
        requiresSetup:
          inspection?.state === AiIntegration.McpConfigurationState.STANDALONE &&
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
        integrations: mcpIntegrations,
        configuredCount,
        configurableCount: configurableIntegrations.length,
        operationInProgress: mcpOperationInProgress,
        legacyInstructionsConfigured
      }
    };
  }

  private async handleMessage(message: { command?: string; agent?: AiIntegration.AiAgent }): Promise<void> {
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

  private async runMcpSetup(agentId?: AiIntegration.AiAgent): Promise<void> {
    if (this.mcpSetupInProgress) {
      return;
    }
    const agent = getDetectedIdeAgents().find(detectedAgent => detectedAgent.id === agentId)?.id;
    if (agent === undefined || !supportsStandaloneMCP(agent)) {
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
