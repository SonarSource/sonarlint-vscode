/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';

import { Commands } from './commands';
import { Connection } from './connections';
import { ConnectionCheckResult } from './protocol';
import * as util from './util';
import { ResourceResolver } from './webview';

let connectionSetupPanel: vscode.WebviewPanel;

const SONARLINT_SETTINGS_KEY = 'sonarlint';
const SONARQUBE_CONNECTIONS_KEY = 'connectedMode.connections.sonarqube';

const sonarQubeNotificationsDocUrl = 'https://docs.sonarqube.org/latest/user-guide/sonarlint-notifications/';

export function connectToSonarQube(context: vscode.ExtensionContext) {
  return () => {
    const initialState = {
      serverUrl: '',
      token: '',
      connectionId: ''
    };
    lazyCreateConnectionSetupPanel(context);
    connectionSetupPanel.webview.html =
        renderConnectionSetupPanel(context, connectionSetupPanel.webview, { mode: 'create', initialState });
    finishSetupAndRevealPanel();
  };
}

export function editSonarQubeConnection(context: vscode.ExtensionContext) {
  return async (connection: string | Promise<Connection>) => {
    const connectionId = typeof(connection) === 'string' ? connection : (await connection).id;
    const initialState = loadConnection(connectionId);
    lazyCreateConnectionSetupPanel(context);
    connectionSetupPanel.webview.html =
        renderConnectionSetupPanel(context, connectionSetupPanel.webview, { mode: 'update', initialState });
    finishSetupAndRevealPanel();
  };
}

function finishSetupAndRevealPanel() {
  connectionSetupPanel.webview.onDidReceiveMessage(handleMessage);
  connectionSetupPanel.iconPath = util.resolveExtensionFile('images', 'sonarqube.svg');
  connectionSetupPanel.reveal();
}

export async function reportConnectionCheckResult(result: ConnectionCheckResult) {
  if (connectionSetupPanel) {
    const command = result.success ? 'connectionCheckSuccess' : 'connectionCheckFailure';
    connectionSetupPanel.webview.postMessage({ command, ...result });
  } else {
    // If connection UI is not shown, fallback to notifications
    if (result.success) {
      vscode.window.showInformationMessage(`Connection with '${result.connectionId}' was successful!`);
    } else {
      const editConnectionAction = 'Edit Connection';
      const reply = await vscode.window.showErrorMessage(
          `Connection with '${result.connectionId}' failed: ${result.reason})`, editConnectionAction);
      if (reply === editConnectionAction) {
        vscode.commands.executeCommand(Commands.EDIT_SONARQUBE_CONNECTION, result.connectionId);
      }
    }
  }
}

function lazyCreateConnectionSetupPanel(context: vscode.ExtensionContext) {
  if (!connectionSetupPanel) {
    connectionSetupPanel = vscode.window.createWebviewPanel(
      'sonarlint.ConnectionSetup',
      'SonarQube Connection',
      vscode.ViewColumn.Active,
      {
        enableScripts: true
      }
    );
    connectionSetupPanel.onDidDispose(
      () => {
        connectionSetupPanel = undefined;
      },
      null,
      context.subscriptions
    );
  }
}

interface RenderOptions {
  mode: 'create' | 'update';
  initialState: SonarQubeConnection;
}

function renderConnectionSetupPanel(context: vscode.ExtensionContext, webview: vscode.Webview, options: RenderOptions) {
  const resolver = new ResourceResolver(context, webview);
  const styleSrc = resolver.resolve('styles', 'connectionsetup.css');
  const toolkitUri = resolver.resolve('node_modules', '@vscode', 'webview-ui-toolkit', 'dist', 'toolkit.min.js');
  const webviewMainUri = resolver.resolve('webview-ui', 'connectionsetup.js');

  const { mode, initialState } = options;

  const serverProductName = 'SonarQube';

  return `<!doctype html><html lang="en">
    <head>
      <title>${serverProductName} Connection</title>
      <meta http-equiv="Content-Type" content="text/html;charset=utf-8" />
      <meta http-equiv="Encoding" content="utf-8" />
      <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src ${webview.cspSource}; script-src ${webview.cspSource}"/>
      <link rel="stylesheet" type="text/css" href="${styleSrc}" />
      <script type="module" src="${toolkitUri}"></script>
      <script type="module" src="${webviewMainUri}"></script>
    </head>
    <body>
      <h1>${mode === 'create' ? 'New' : 'Edit'} ${serverProductName} Connection</h1>
      <form id="connectionForm">
        <vscode-text-field id="serverUrl" type="url" placeholder="https://your.sonarqube.server/" required size="40"
          title="The base URL for your SonarQube server" autofocus value="${initialState.serverUrl}">
          Server URL
        </vscode-text-field>
        <input type="hidden" id="serverUrl-initial" value="${initialState.serverUrl}" />
        <vscode-button id="generateToken" ${initialState.serverUrl === '' ? 'disabled' : ''}>
          Generate Token
        </vscode-button>
        <p>
          You can use the button above to generate a user token in your ${serverProductName} settings,
          copy it and paste it in the field below.
        </p>
        <vscode-text-field id="token" type="password" placeholder="········" required size="40"
          title="A user token generated for your account on ${serverProductName}" value="${initialState.token}">
          User Token
        </vscode-text-field>
        <input type="hidden" id="token-initial" value="${initialState.token}" />
        <vscode-text-field id="connectionId" type="text" placeholder="My ${serverProductName} Server" size="40"
          title="Optionally, please give this connection a memorable name" value="${initialState.connectionId}"
          ${options.mode === 'update' ? 'readonly' : ''}>
          Connection Name
        </vscode-text-field>
        <input type="hidden" id="connectionId-initial" value="${initialState.connectionId}" />
        <input type="hidden" id="shouldGenerateConnectionId" value="${mode === 'create'}"/>
        <vscode-checkbox id="enableNotifications" ${!initialState.disableNotifications ? 'checked' : ''}>
          Receive notifications from ${serverProductName}
        </vscode-checkbox>
        <input type="hidden" id="enableNotifications-initial" value="${!initialState.disableNotifications}" />
        <p>
          You will receive
          <vscode-link target="_blank" href="${sonarQubeNotificationsDocUrl}">notifications</vscode-link>
          from ${serverProductName} in situations like:
        </p>
        <ul>
          <li>the Quality Gate status of a bound project changes</li>
          <li>the latest analysis of a bound project on ${serverProductName} raises new issues assigned to you</li>
        </ul>
        <div id="connectionCheck">
          <vscode-button id="saveConnection" disabled>Save Connection</vscode-button>
          <span id="connectionProgress" class="hidden">
            <vscode-progress-ring/>
          </span>
          <span id="connectionStatus"></span>
        </div>
      </form>
    </body>
  </html>`;
}

function loadConnection(connectionId: string) {
  const allSonarQubeConnections = vscode.workspace.getConfiguration(SONARLINT_SETTINGS_KEY)
      .get<Array<SonarQubeConnection>>(SONARQUBE_CONNECTIONS_KEY);
  return allSonarQubeConnections.find(c => c.connectionId === connectionId);
}

/*
 * Exported for unit tests
 */
export async function handleMessage(message) {
  switch(message.command) {
    case 'openTokenGenerationPage':
      await openTokenGenerationPage(message);
      break;
    case 'saveConnection':
      delete message.command;
      if (!message.disableNotifications) {
        delete message.disableNotifications;
      }
      message.serverUrl = cleanServerUrl(message.serverUrl);
      await saveConnection(message);
      break;
  }
}

async function openTokenGenerationPage(message) {
  const { serverUrl } = message;
  const cleanedUrl = cleanServerUrl(serverUrl);
  const accountSecurityUrl = `${cleanedUrl}/account/security/`;
  await vscode.commands.executeCommand(Commands.OPEN_BROWSER, vscode.Uri.parse(accountSecurityUrl));
}

interface SonarQubeConnection {
  connectionId?: string;
  serverUrl: string;
  token: string;
  disableNotifications?: boolean;
}

async function saveConnection(connection: SonarQubeConnection) {
  const configuration = vscode.workspace.getConfiguration(SONARLINT_SETTINGS_KEY);
  const sonarqubeConnectionsSection = SONARQUBE_CONNECTIONS_KEY;
  const existingConnections = configuration.get<Array<SonarQubeConnection>>(sonarqubeConnectionsSection);
  const matchingConnection = existingConnections
    .find(c => c.connectionId === connection.connectionId);
  if (matchingConnection) {
    Object.assign(matchingConnection, connection);
  } else {
    existingConnections.push(connection);
  }
  await connectionSetupPanel.webview.postMessage({ command: 'connectionCheckStart' });
  await configuration.update(sonarqubeConnectionsSection, existingConnections, vscode.ConfigurationTarget.Global);
}

function cleanServerUrl(serverUrl: string) {
  return removeTrailingSlashes(serverUrl.trim());
}

function removeTrailingSlashes(url: string) {
  let cleanedUrl = url;
  while(cleanedUrl.endsWith('/')) {
    cleanedUrl = cleanedUrl.substring(0, cleanedUrl.length - 1);
  }
  return cleanedUrl;
}
