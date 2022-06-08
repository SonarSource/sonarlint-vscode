/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import { ConfigurationTarget } from 'vscode';
import { Commands } from './commands';
import { ResourceResolver } from './webview';
import * as util from './util';

let connectionSetupPanel: vscode.WebviewPanel;

export function connectToSonarQube(context: vscode.ExtensionContext) {
  return () => {
    lazyCreateConnectionSetupPanel(context);
    connectionSetupPanel.webview.html = renderConnectionSetupPanel(context, connectionSetupPanel.webview);
    connectionSetupPanel.webview.onDidReceiveMessage(handleMessage);
    connectionSetupPanel.iconPath = {
      light: util.resolveExtensionFile('images/sonarqube.svg'),
      dark: util.resolveExtensionFile('images/sonarqube.svg')
    };
    connectionSetupPanel.reveal();
  };
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

function renderConnectionSetupPanel(context: vscode.ExtensionContext, webview: vscode.Webview) {
  const resolver = new ResourceResolver(context, webview);
  const styleSrc = resolver.resolve('styles', 'connectionsetup.css');
  const toolkitUri = resolver.resolve(
    'node_modules',
    '@vscode',
    'webview-ui-toolkit',
    'dist',
    'toolkit.js'
  );
  const webviewMainUri = resolver.resolve('webview-ui', 'connectionsetup.js');

  return `<!doctype html><html lang="en">
    <head>
      <title>SonarQube Connection</title>
      <meta http-equiv="Content-Type" content="text/html;charset=utf-8" />
      <meta http-equiv="Encoding" content="utf-8" />
      <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src ${webview.cspSource}; script-src ${webview.cspSource}"/>
      <link rel="stylesheet" type="text/css" href="${styleSrc}" />
      <script type="module" src="${toolkitUri}"></script>
      <script type="module" src="${webviewMainUri}"></script>
    </head>
    <body>
      <h1>SonarQube Connection</h1>
      <form id="connectionForm">
        <vscode-text-field id="connectionId" type="text" placeholder="My SonarQube Server" size="40"
          title="Please give this connection a memorable name (optional)">
          Connection Name
        </vscode-text-field>
        <vscode-text-field id="serverUrl" type="url" placeholder="https://your.sonarqube.server/" required size="40"
          title="The base URL for your SonarQube server">
          Server URL
        </vscode-text-field>
        <vscode-button id="generateToken" disabled>Generate Token</vscode-button>
        <p>
          You can use the button above to generate a user token in your SonarQube settings,
          copy it and paste it in the field below.
        </p>
        <vscode-text-field id="token" type="password" placeholder="········" required size="40"
          title="A user token generated for your account on SonarQube">
          User Token
        </vscode-text-field>
        <vscode-button id="saveConnection" disabled>Save Connection</vscode-button>
      </form>
    </body>
  </html>`;
}

/*
 * Exported for unit tests
 */
export async function handleMessage(message) {
  switch(message.command) {
    case 'openTokenGenerationPage':
      openTokenGenerationPage(message);
      break;
    case 'saveConnection':
      delete message.command;
      saveConnection(message);
      break;
  }
}

function openTokenGenerationPage(message) {
  const { serverUrl } = message;
  // Remove trailing slash(es) before appending actual page
  const accountSecurityUrl = `${serverUrl.replace(/\/*$/, '')}/account/security/`;
  return vscode.commands.executeCommand(Commands.OPEN_BROWSER, vscode.Uri.parse(accountSecurityUrl));
}

interface SonarQubeConnection {
  connectionId?: string;
  serverUrl: string;
  token: string;
}

async function saveConnection(message: SonarQubeConnection) {
  const configuration = vscode.workspace.getConfiguration('sonarlint');
  const sonarqubeConnectionsSection = 'connectedMode.connections.sonarqube';
  const existingConnections = configuration.get<Array<SonarQubeConnection>>(sonarqubeConnectionsSection);
  const matchingConnection = existingConnections
    .find(c => c.connectionId === message.connectionId || c.serverUrl === message.serverUrl);
  if (matchingConnection) {
    Object.assign(matchingConnection, message);
  } else {
    existingConnections.push(message);
  }
  await configuration.update(sonarqubeConnectionsSection, existingConnections, ConfigurationTarget.Global);
  connectionSetupPanel.dispose();
}
