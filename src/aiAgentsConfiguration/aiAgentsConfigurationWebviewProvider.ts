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
import { ResourceResolver } from '../util/webview';
import { ExtendedServer } from '../lsp/protocol';
import { isHookInstalled } from './aiAgentHooks';
import { isSonarQubeRulesFileConfigured } from './aiAgentRuleConfig';
import {
  DetectedIdeAgent,
  getCurrentIntegrationTargetWithHookSupport,
  getCurrentIntegrationTargetWithMCPSupport,
  getCurrentIdeHost,
  getDetectedIdeAgents
} from './aiAgentUtils';
import { AiIntegrationService, toProtocolAgent } from './aiIntegrationService';
import { getCurrentSonarQubeMCPServerConfig } from './mcpServerConfig';

const WEBVIEW_UI_DIR = 'webview-ui';
const CLI_DOCUMENTATION_URL = vscode.Uri.parse('https://www.sonarsource.com/sonarqube/cli/');
const VORTEX_DOCUMENTATION_URL = vscode.Uri.parse('https://www.sonarsource.com/blog/introducing-sonar-vortex/');
const MCP_CONFIGURATOR_URL = vscode.Uri.parse('https://mcp.sonarqube.com/');
type CliInstallationStatus = 'INSTALLED' | 'NOT_INSTALLED' | 'UNUSABLE';

const CLI_INSTALLATION_STATUS_BY_PROTOCOL: Record<ExtendedServer.CliInstallationStatus, CliInstallationStatus> = {
  [ExtendedServer.CliInstallationStatus.NOT_INSTALLED]: 'NOT_INSTALLED',
  [ExtendedServer.CliInstallationStatus.INSTALLED]: 'INSTALLED',
  [ExtendedServer.CliInstallationStatus.UNUSABLE]: 'UNUSABLE'
};

export interface AIAgentsConfigurationState {
  ideName: string;
  isRemote: boolean;
  agents: Array<DetectedIdeAgent & { supportsCliIntegration: boolean }>;
  cli: {
    installationStatus: CliInstallationStatus;
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
    const mcpAgent = getCurrentIntegrationTargetWithMCPSupport();
    const hookAgent = getCurrentIntegrationTargetWithHookSupport();
    const [integrationState, legacyInstructionsConfigured, hookConfigured] = await Promise.all([
      this.aiIntegrationService.getIntegrationState(
        ide.id,
        detectedAgents.map(agent => agent.id),
        ExtendedServer.AiIntegrationScope.GLOBAL
      ),
      isSonarQubeRulesFileConfigured(),
      hookAgent ? isHookInstalled(hookAgent) : Promise.resolve(false)
    ]);
    const mcpConfigured = getCurrentSonarQubeMCPServerConfig() !== undefined;
    const cliSupportByAgent = new Map(
      integrationState.agents.map(capability => [capability.agent, capability.cliIntegrationSupported])
    );
    const agents = detectedAgents.map(agent => ({
      ...agent,
      supportsCliIntegration: cliSupportByAgent.get(toProtocolAgent(agent.id)) ?? false
    }));
    const mcpAgentName = agents.find(agent => agent.id === mcpAgent)?.name;

    return {
      ideName: ide.name,
      isRemote: vscode.env.remoteName !== undefined,
      agents,
      cli: {
        installationStatus: CLI_INSTALLATION_STATUS_BY_PROTOCOL[integrationState.cli.installationStatus],
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

  private async handleMessage(message: { command?: string }): Promise<void> {
    switch (message.command) {
      case 'ready':
      case 'refresh':
        await this.refresh();
        break;
      case 'configureMcp':
        await vscode.commands.executeCommand(Commands.CONFIGURE_MCP_SERVER);
        await this.refresh();
        break;
      case 'openMcpConfiguration':
        await vscode.commands.executeCommand(Commands.OPEN_MCP_SERVER_CONFIGURATION);
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
      case 'openVortexDocumentation':
        await vscode.env.openExternal(VORTEX_DOCUMENTATION_URL);
        break;
      case 'openMcpDocumentation':
        await vscode.env.openExternal(MCP_CONFIGURATOR_URL);
        break;
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
