/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import * as util from '../util/util';
import { ResourceResolver } from '../util/webview';
import { ConnectionSettingsService } from '../settings/connectionsettings';
import { DEFAULT_CONNECTION_ID } from '../commons';

let listConnectionsPanel;

export function listConnections(context: vscode.ExtensionContext) {
    lazyCreateListConnectionsPanel(context);
    listConnectionsPanel.webview.html = generateHTML(context, listConnectionsPanel.webview);
    listConnectionsPanel.iconPath = {
      light: util.resolveExtensionFile('images', 'sonarqube_for_ide.svg'),
      dark: util.resolveExtensionFile('images', 'sonarqube_for_ide_dark.svg')
    };
    listConnectionsPanel.reveal();
    listConnectionsPanel.webview.onDidReceiveMessage(handleMessage);

    setSonarCloudConnections();
    setSonarQubeConnections();
}

export function setSonarQubeConnections() {
  const serverConnections = ConnectionSettingsService.instance.getSonarQubeConnections().map((connection) => {
    return {
    serverUrl: connection.serverUrl,
    connectionId: connection.connectionId || DEFAULT_CONNECTION_ID,
    connectionCheckResult: connection.connectionCheckResult,
    };
  });

  listConnectionsPanel.webview.postMessage({
    command: 'setServerConnections',
    connections: serverConnections
  });
}

export function setSonarCloudConnections() {
  const cloudConnections = ConnectionSettingsService.instance.getSonarCloudConnections().map((connection) => {
    return {
    organizationKey: connection.organizationKey,
    connectionId: connection.connectionId || DEFAULT_CONNECTION_ID,
    connectionCheckResult: connection.connectionCheckResult,
    };
  });

  listConnectionsPanel.webview.postMessage({
    command: 'setCloudConnections',
    connections: cloudConnections
  });
}

function handleMessage(message) {
    switch (message.command) {
        case 'showNotification':
            vscode.window.showInformationMessage(`Demo notification from SonarQube List Connections View says: '${message.displayMessage}'!`);
            break;
        default: break;
    }
}

function lazyCreateListConnectionsPanel(context: vscode.ExtensionContext) {
    listConnectionsPanel = vscode.window.createWebviewPanel(
      'sonarqube.listConnections',
      'SonarQube List Connections',
      vscode.ViewColumn.Two,
      {
        enableScripts: true
      }
    );
    listConnectionsPanel.onDidDispose(
      () => {
        listConnectionsPanel = undefined;
      },
      null,
      context.subscriptions
    );
}

function generateHTML(context, webview) {
  const resolver = new ResourceResolver(context, webview);
  const webviewMainUri = resolver.resolve('views', 'dist', 'connectionsList.js');
  return `<!doctype html><html lang="en">
    <head>
      <title>List of Connections</title>
      <meta http-equiv="Content-Type" content="text/html;charset=utf-8" />
      <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src ${webview.cspSource}; script-src ${webview.cspSource}"/>
      <script type="module" src="${webviewMainUri}"></script>
    </head>
    <body>
        <div id="root"></div>
    </body>
    </html>`;
}