/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import { DEFAULT_CONNECTION_ID } from '../commons';
import { Connection } from '../connected/connections';
import { SonarLintExtendedLanguageClient } from '../lsp/client';
import { ConnectionSettingsService } from '../settings/connectionsettings';
import { logToSonarLintOutput } from '../util/logging';

// Must match contributes.mcpServerDefinitionProviders in package.json
export const COPILOT_MCP_PROVIDER_ID = 'sonarqube';
export const COPILOT_MCP_SERVER_LABEL = 'SonarQube';
const COPILOT_MCP_CONNECTION_KEY = 'sonarlint.mcp.copilotConnection';
const CONNECTIONS_SETTING = 'sonarlint.connectedMode.connections';
const SONARQUBE_TOKEN = 'SONARQUBE_TOKEN';

interface StoredCopilotMcpConnection {
  connectionId: string;
  label: string;
  contextValue: Connection['contextValue'];
}

interface SonarQubeMcpLaunchConfiguration {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

let provider: CopilotMcpProvider | undefined;

class CopilotMcpProvider implements vscode.McpServerDefinitionProvider<vscode.McpStdioServerDefinition> {
  private readonly changes = new vscode.EventEmitter<void>();
  readonly onDidChangeMcpServerDefinitions = this.changes.event;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly languageClient: SonarLintExtendedLanguageClient
  ) {}

  refresh(): void {
    this.changes.fire();
  }

  getStoredConnection(): StoredCopilotMcpConnection | undefined {
    return this.context.globalState.get<StoredCopilotMcpConnection>(COPILOT_MCP_CONNECTION_KEY);
  }

  async storeConnection(connection: StoredCopilotMcpConnection): Promise<void> {
    await this.context.globalState.update(COPILOT_MCP_CONNECTION_KEY, connection);
    this.refresh();
  }

  // The definition VS Code keeps in its cache has no token; resolveMcpServerDefinition adds it before each start
  async provideMcpServerDefinitions(): Promise<vscode.McpStdioServerDefinition[]> {
    const launch = await this.loadLaunchConfiguration();
    if (launch === undefined) {
      return [];
    }
    const { [SONARQUBE_TOKEN]: _token, ...env } = launch.env ?? {};
    return [new vscode.McpStdioServerDefinition(COPILOT_MCP_SERVER_LABEL, launch.command, launch.args ?? [], env)];
  }

  async resolveMcpServerDefinition(
    server: vscode.McpStdioServerDefinition
  ): Promise<vscode.McpStdioServerDefinition | undefined> {
    const launch = await this.loadLaunchConfiguration();
    if (launch === undefined) {
      return undefined;
    }
    server.command = launch.command;
    server.args = launch.args ?? [];
    server.env = launch.env ?? {};
    return server;
  }

  private async loadLaunchConfiguration(): Promise<SonarQubeMcpLaunchConfiguration | undefined> {
    const connection = findConfiguredConnection(this.getStoredConnection());
    if (connection === undefined) {
      return undefined;
    }
    try {
      const token = await ConnectionSettingsService.instance.getTokenForConnection(connection);
      const configuration = await this.languageClient.getMCPServerConfiguration(
        connection.id || DEFAULT_CONNECTION_ID,
        token ?? ''
      );
      return JSON.parse(configuration.jsonConfiguration) as SonarQubeMcpLaunchConfiguration;
    } catch (error) {
      logToSonarLintOutput(`Could not provide the SonarQube MCP server to GitHub Copilot: ${String(error)}`);
      return undefined;
    }
  }
}

function findConfiguredConnection(stored?: StoredCopilotMcpConnection): Connection | undefined {
  if (stored === undefined) {
    return undefined;
  }
  const settings = ConnectionSettingsService.instance;
  const candidates =
    stored.contextValue === 'sonarqubeConnection'
      ? settings.getSonarQubeConnections()
      : settings.getSonarCloudConnections();
  const match = candidates.find(candidate => (candidate.connectionId || DEFAULT_CONNECTION_ID) === stored.connectionId);
  return match === undefined ? undefined : new Connection(match.connectionId, stored.label, stored.contextValue, 'ok');
}

// Hosts older than VS Code 1.101 and some forks do not offer this API; Copilot then falls back to mcp.json
export function registerCopilotMcpProvider(
  context: vscode.ExtensionContext,
  languageClient: SonarLintExtendedLanguageClient
): void {
  if (typeof vscode.lm?.registerMcpServerDefinitionProvider !== 'function') {
    return;
  }
  const registered = new CopilotMcpProvider(context, languageClient);
  context.subscriptions.push(
    vscode.lm.registerMcpServerDefinitionProvider(COPILOT_MCP_PROVIDER_ID, registered),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration(CONNECTIONS_SETTING)) {
        registered.refresh();
      }
    }),
    new vscode.Disposable(() => {
      if (provider === registered) {
        provider = undefined;
      }
    })
  );
  provider = registered;
}

export function isCopilotMcpProviderRegistered(): boolean {
  return provider !== undefined;
}

export function isCopilotMcpProviderConfigured(): boolean {
  return provider !== undefined && findConfiguredConnection(provider.getStoredConnection()) !== undefined;
}

export async function setCopilotMcpConnection(connection: Connection): Promise<void> {
  if (provider === undefined) {
    throw new Error('GitHub Copilot MCP server registration is not available.');
  }
  await provider.storeConnection({
    connectionId: connection.id || DEFAULT_CONNECTION_ID,
    label: connection.label,
    contextValue: connection.contextValue
  });
}

export function refreshCopilotMcpServer(): void {
  provider?.refresh();
}
