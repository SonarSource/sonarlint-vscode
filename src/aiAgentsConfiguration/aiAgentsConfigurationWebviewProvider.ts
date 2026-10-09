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
import { logToSonarLintOutput, showLogOutput } from '../util/logging';
import { ResourceResolver } from '../util/webview';
import { AiIntegration } from '../lsp/aiIntegrationProtocol';
import { SonarLintExtendedLanguageClient } from '../lsp/client';
import { ContextManager } from '../contextManager';
import { AiIntegrationTelemetry } from './aiIntegrationTelemetry';
import {
  getAiIntegrationStateParams,
  getCurrentIdeHost,
  getDetectedIntegrationAgents,
  isAgentActiveForMcp
} from './aiAgentUtils';
import {
  canIntegrateAgent,
  CliPrimaryAction,
  CliSetupNotice,
  CliSetupSession,
  CliSetupStep,
  resolveCliPrimaryAction
} from './cliSetup';
import {
  getActiveMcpAgent,
  getMCPConfigPath,
  inspectMCPConfiguration,
  isMCPSetupInProgress,
  isStandaloneMcpReady,
  supportsStandaloneMCP
} from './mcpServerConfig';

const WEBVIEW_UI_DIR = 'webview-ui';
const CLI_DOCUMENTATION_URL = vscode.Uri.parse('https://docs.sonarsource.com/sonarqube-cli');
const VORTEX_DOCUMENTATION_URL = vscode.Uri.parse(
  'https://docs.sonarsource.com/agent-centric-development-cycle/inside-your-agent-the-agentic-loop/sonar-vortex'
);
const MCP_CONFIGURATOR_URL = vscode.Uri.parse('https://mcp.sonarqube.com/');
// The session finishes with a setup step. This is the action runCliSetup already started.
const CLI_ACTION_BY_STEP: Record<CliSetupStep, AiIntegration.AiIntegrationAction> = {
  install: AiIntegration.AiIntegrationAction.INSTALL_CLI,
  authenticate: AiIntegration.AiIntegrationAction.LOGIN_CLI,
  integrate: AiIntegration.AiIntegrationAction.INTEGRATE_AGENT
};

type StandaloneMcpInspection = {
  agent: AiIntegration.AiAgent;
  inspection: AiIntegration.McpConfigurationInspectionResponse;
};

interface InspectedIntegration {
  integrationState: AiIntegration.GetAiIntegrationStateResponse;
  inspections: StandaloneMcpInspection[];
}

export interface AIAgentsConfigurationState {
  ideName: string;
  isRemote: boolean;
  agents: Array<{
    id: AiIntegration.AiAgent;
    name: string;
    supportsCliIntegration: boolean;
    recordingStatus: AiIntegration.CliIntegrationRecordingStatusName;
    configurationPaths: Array<string | null>;
  }>;
  cli: {
    installationStatus: AiIntegration.CliInstallationStatusName;
    authenticationStatus: AiIntegration.CliAuthenticationStatusName;
    serverUrl?: string;
    organization?: string;
    operationInProgress: boolean;
    notice?: CliSetupNotice;
    primaryAction?: CliPrimaryAction;
    canIntegrate: boolean;
    uninstallAvailable: boolean;
  };
  mcp: {
    integrations: Array<{
      agentId: AiIntegration.AiAgent;
      agentName: string;
      standaloneSupported: boolean;
      availableThroughCli: boolean;
      configurationPath?: string;
      configurationStatus?: AiIntegration.McpConfigurationStateName;
      diagnostic?: string;
      operationInProgress: boolean;
    }>;
    configuredCount: number;
    configurableCount: number;
    operationInProgress: boolean;
  };
}

export class AIAgentsConfigurationWebviewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private resolver?: ResourceResolver;
  private cliSetupSession?: CliSetupSession;
  private readonly telemetry: AiIntegrationTelemetry;
  private initialObservationPending = false;
  private refreshGeneration = 0;

  constructor(
    private readonly extensionContext: vscode.ExtensionContext,
    private readonly languageClient: SonarLintExtendedLanguageClient
  ) {
    this.telemetry = new AiIntegrationTelemetry(languageClient);
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
    this.initialObservationPending = true;
    webviewView.onDidDispose(
      () => {
        if (this.view === webviewView) {
          this.view = undefined;
          this.initialObservationPending = false;
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
    await this.refreshWithObservation();
  }

  async refreshOnRequest(): Promise<void> {
    if (this.cliSetupSession) {
      this.cliSetupSession.notice = undefined;
    }
    this.telemetry.action(AiIntegration.AiIntegrationAction.REFRESH, {
      status: AiIntegration.AiIntegrationActionStatus.STARTED
    });
    const succeeded = await this.refreshWithObservation(true);
    this.telemetry.action(AiIntegration.AiIntegrationAction.REFRESH, {
      status: succeeded
        ? AiIntegration.AiIntegrationActionStatus.SUCCEEDED
        : AiIntegration.AiIntegrationActionStatus.FAILED
    });
  }

  async refreshAfterAction(): Promise<void> {
    await this.refreshWithObservation(true);
  }

  private async refreshWithObservation(observe = false): Promise<boolean> {
    this.refreshGeneration++;
    const generation = this.refreshGeneration;
    const view = this.view;
    if (!view) {
      if (!observe) {
        return false;
      }
      try {
        this.emitObservation(await this.loadInspectedIntegration());
        return true;
      } catch {
        return false;
      }
    }
    try {
      const state = await this.buildState(observe);
      if (this.view !== view || this.refreshGeneration !== generation) {
        // Loading succeeded; a newer refresh or view owns publication.
        return true;
      }
      ContextManager.instance.setMCPServerSupportedAgentContext(
        state.mcp.integrations.some(integration => integration.standaloneSupported)
      );
      await view.webview.postMessage({ command: 'state', state });
      return true;
    } catch (error) {
      logToSonarLintOutput(`Could not refresh AI integrations state: ${String(error)}`);
      if (this.view === view && this.refreshGeneration === generation) {
        await view.webview.postMessage({ command: 'error' }).then(undefined, () => undefined);
      }
      return false;
    }
  }

  // One snapshot feeds the view and telemetry. CLI and agent observations are emitted together from it.
  private async loadInspectedIntegration(): Promise<InspectedIntegration> {
    const integrationState = await this.languageClient.getAiIntegrationState(
      getAiIntegrationStateParams(AiIntegration.AiIntegrationScope.GLOBAL)
    );
    return { integrationState, inspections: await this.inspectStandaloneAgents(integrationState) };
  }

  private emitObservation(snapshot: InspectedIntegration): void {
    this.telemetry.cliState(snapshot.integrationState.cli);
    this.telemetry.agentStates(
      snapshot.integrationState.agents,
      new Map(snapshot.inspections.map(result => [result.agent, result.inspection.state]))
    );
  }

  private inspectStandaloneAgents(
    integrationState: AiIntegration.GetAiIntegrationStateResponse
  ): Promise<StandaloneMcpInspection[]> {
    return Promise.all(
      getDetectedIntegrationAgents(integrationState)
        .filter(agent => agent.standaloneMcpSupported && isStandaloneMcpReady(agent.agent))
        .map(async agent => {
          try {
            return { agent: agent.agent, inspection: await inspectMCPConfiguration(this.languageClient, agent.agent) };
          } catch (error) {
            logToSonarLintOutput(`Could not inspect ${agent.name} MCP configuration: ${String(error)}`);
            return {
              agent: agent.agent,
              inspection: {
                state: AiIntegration.McpConfigurationState.UNKNOWN,
                diagnostics: [`Could not inspect ${agent.name} MCP configuration.`]
              }
            };
          }
        })
    );
  }

  private async buildState(observe = false): Promise<AIAgentsConfigurationState> {
    const ide = getCurrentIdeHost();
    const snapshot = await this.loadInspectedIntegration();
    if (observe) {
      this.emitObservation(snapshot);
    }
    const { integrationState, inspections } = snapshot;
    const detectedAgents = getDetectedIntegrationAgents(integrationState);
    const mcpAgents = detectedAgents.filter(agent => isAgentActiveForMcp(agent.agent));
    const agents = detectedAgents.map(agent => {
      const integration = integrationState.cliIntegrations?.find(state => state.agent === agent.agent);
      const recordingStatus = integration?.recordingStatus ?? AiIntegration.CliIntegrationRecordingStatus.UNKNOWN;
      return {
        id: agent.agent,
        name: agent.name,
        supportsCliIntegration: agent.cliIntegrationSupported,
        recordingStatus: AiIntegration.CLI_INTEGRATION_RECORDING_STATUS_NAMES[recordingStatus] ?? 'UNKNOWN',
        configurationPaths: (integration?.configurations ?? []).map(configuration => configuration.path ?? null)
      };
    });
    const isRemote = vscode.env.remoteName !== undefined;
    const cliSetup = this.getCliSetup();
    const { installationStatus, authenticationStatus } = integrationState.cli;
    const inspectionByAgent = new Map(inspections.map(result => [result.agent, result.inspection]));
    const mcpOperationInProgress = isMCPSetupInProgress();
    const activeMcpAgent = getActiveMcpAgent();
    const mcpIntegrations = mcpAgents.map(agent => {
      const standaloneSupported = isStandaloneMcpReady(agent.agent) && agent.standaloneMcpSupported;
      const inspection = inspectionByAgent.get(agent.agent);
      return {
        agentId: agent.agent,
        agentName: agent.name,
        standaloneSupported,
        availableThroughCli: !supportsStandaloneMCP(agent.agent) && agent.cliIntegrationSupported,
        configurationPath: standaloneSupported ? getMCPConfigPath(agent.agent) : undefined,
        configurationStatus:
          inspection === undefined ? undefined : AiIntegration.MCP_CONFIGURATION_STATE_NAMES[inspection.state],
        diagnostic: inspection?.diagnostics[0],
        operationInProgress: mcpOperationInProgress && activeMcpAgent === agent.agent
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
        installationStatus: AiIntegration.CLI_INSTALLATION_STATUS_NAMES[installationStatus],
        authenticationStatus: AiIntegration.CLI_AUTHENTICATION_STATUS_NAMES[authenticationStatus],
        serverUrl: integrationState.cli.serverUrl ?? undefined,
        organization: integrationState.cli.organization ?? undefined,
        operationInProgress: cliSetup.operationInProgress,
        uninstallAvailable: !isRemote && integrationState.cli.uninstallAvailable === true,
        notice: cliSetup.notice,
        primaryAction: resolveCliPrimaryAction(installationStatus, authenticationStatus, isRemote),
        canIntegrate: canIntegrateAgent(
          installationStatus,
          authenticationStatus,
          isRemote,
          cliSetup.operationInProgress
        )
      },
      mcp: {
        integrations: mcpIntegrations,
        configuredCount,
        configurableCount: configurableIntegrations.length,
        operationInProgress: mcpOperationInProgress
      }
    };
  }

  private async handleMessage(message: { command?: string; agent?: AiIntegration.AiAgent }): Promise<void> {
    switch (message.command) {
      case 'ready': {
        const report = this.initialObservationPending;
        this.initialObservationPending = false;
        await this.refreshWithObservation(report);
        break;
      }
      case 'refresh':
        await this.refreshOnRequest();
        break;
      case 'configureMcp':
        await vscode.commands.executeCommand(Commands.CONFIGURE_MCP_SERVER, message.agent);
        break;
      case 'openMcpConfiguration':
        await vscode.commands.executeCommand(Commands.OPEN_MCP_SERVER_CONFIGURATION, message.agent);
        break;
      case 'openCliDocumentation':
        await this.openDocumentation(AiIntegration.AiIntegrationAction.OPEN_CLI_DOCUMENTATION, CLI_DOCUMENTATION_URL);
        break;
      case 'installCli':
        await this.runCliSetup(AiIntegration.AiIntegrationAction.INSTALL_CLI, 'install');
        break;
      case 'authenticateCli':
        await this.runCliSetup(AiIntegration.AiIntegrationAction.LOGIN_CLI, 'authenticate');
        break;
      case 'uninstallCli':
        await this.getCliSetup().uninstall(
          () => this.telemetry.action(AiIntegration.AiIntegrationAction.UNINSTALL_CLI, {
            status: AiIntegration.AiIntegrationActionStatus.STARTED
          }),
          outcome => this.telemetry.action(AiIntegration.AiIntegrationAction.UNINSTALL_CLI, outcome)
        );
        break;
      case 'showCliOutput':
        showLogOutput();
        break;
      case 'integrateAgent':
        await this.runCliSetup(AiIntegration.AiIntegrationAction.INTEGRATE_AGENT, 'integrate', message.agent);
        break;
      case 'openVortexDocumentation':
        await this.openDocumentation(
          AiIntegration.AiIntegrationAction.OPEN_VORTEX_DOCUMENTATION,
          VORTEX_DOCUMENTATION_URL
        );
        break;
      case 'openMcpDocumentation':
        await this.openDocumentation(AiIntegration.AiIntegrationAction.OPEN_MCP_DOCUMENTATION, MCP_CONFIGURATOR_URL);
        break;
    }
  }

  private getCliSetup(): CliSetupSession {
    this.cliSetupSession ??= new CliSetupSession(
      this.extensionContext,
      this.languageClient,
      // Omitted while setup is starting. True only once the attempt has finished.
      observe => (observe ? this.refreshAfterAction() : this.refresh()),
      (step, agent, outcome) => {
        this.telemetry.action(CLI_ACTION_BY_STEP[step], { ...outcome, agent });
      }
    );
    return this.cliSetupSession;
  }

  private async runCliSetup(
    action: AiIntegration.AiIntegrationAction,
    step: 'install' | 'authenticate' | 'integrate',
    agent?: AiIntegration.AiAgent
  ): Promise<void> {
    const cliSetup = this.getCliSetup();
    if (!cliSetup.operationInProgress) {
      this.telemetry.action(action, { status: AiIntegration.AiIntegrationActionStatus.STARTED, agent });
    }
    await cliSetup.run(step, agent);
  }

  private async openDocumentation(action: AiIntegration.AiIntegrationAction, url: vscode.Uri): Promise<void> {
    this.telemetry.action(action, { status: AiIntegration.AiIntegrationActionStatus.STARTED });
    try {
      const opened = await vscode.env.openExternal(url);
      this.telemetry.action(action, {
        status: opened
          ? AiIntegration.AiIntegrationActionStatus.SUCCEEDED
          : AiIntegration.AiIntegrationActionStatus.FAILED
      });
    } catch {
      this.telemetry.action(action, { status: AiIntegration.AiIntegrationActionStatus.FAILED });
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
