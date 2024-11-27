/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2024 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';

import { BindingService } from './binding';
import { Connection } from './connections';
import { DEFAULT_CONNECTION_ID } from '../commons';
import { BindingCreationMode, ConnectionCheckResult, Organization } from '../lsp/protocol';
import {
  ConnectionSettingsService,
  isSonarQubeConnection,
  SonarCloudConnection,
  SonarQubeConnection
} from '../settings/connectionsettings';
import { Commands } from '../util/commands';
import * as util from '../util/util';
import { escapeHtml, ResourceResolver } from '../util/webview';

let connectionSetupPanel: vscode.WebviewPanel;

const sonarQubeNotificationsDocUrl = 'https://docs.sonarsource.com/sonarqube-server/latest/user-guide/sonarlint-connected-mode/';
const sonarCloudNotificationsDocUrl =
  'https://docs.sonarsource.com/sonarqube-cloud/improving/sonarlint/#smart-notifications';
const TOKEN_RECEIVED_COMMAND = 'tokenReceived';
const OPEN_TOKEN_GENERATION_PAGE_COMMAND = 'openTokenGenerationPage';
const SAVE_CONNECTION_COMMAND = 'saveConnection';
const ORGANIZATION_LIST_RECEIVED_COMMAND = 'organizationListReceived';

const SONARQUBE_DESCRIPTION =
  `An <b>open-source, self-managed</b> tool that easily integrates into the developers' CI/CD pipeline<br>
  and DevOps platform to systematically help developers and organizations deliver Clean Code.
  <br><br>
  SonarQube offers a free <a id="sonarQubeEditionsDownloads" href="#">Community Build</a>`;

const SONARCLOUD_DESCRIPTION =
  `A <b>Software-as-a-Service (SaaS)</b> tool that easily integrates into the cloud DevOps platforms<br>
  and extends the CI/CD workflow to systematically help developers and organizations deliver Clean Code.
  <br><br>
  <a id="sonarCloudProductPage" href="#">SonarQube Cloud</a> is entirely free for open-source projects.`;

const SONARQUBE_SERVER_LABEL = 'SonarQube Server';
const SONARQUBE_CLOUD_LABEL = 'SonarQube Cloud';

export function connectToSonarQube(context: vscode.ExtensionContext) {
  return (serverUrl='', projectKey='', isFromSharedConfiguration=false, folderUri?: vscode.Uri) => {
    const initialState = {
      conn: {
        serverUrl,
        token: '',
        connectionId: '',
        projectKey,
        isFromSharedConfiguration,
        folderUri: folderUri?.toString(false)
      }
    };
    initializeAndRevealPanel(context, { mode: 'create', initialState }, SONARQUBE_SERVER_LABEL);
  };
}


export function connectToSonarCloud(context: vscode.ExtensionContext) {
  return (organizationKey='', projectKey='', isFromSharedConfiguration=false, folderUri?: vscode.Uri) => {
    const initialState = {
      conn: {
        organizationKey,
        token: '',
        connectionId: '',
        projectKey,
        isFromSharedConfiguration,
        folderUri: folderUri?.toString(false)
      }
    };
    initializeAndRevealPanel(context, { mode: 'create', initialState }, SONARQUBE_CLOUD_LABEL);
  };
}

export function editSonarQubeConnection(context: vscode.ExtensionContext) {
  return async (connection: string | Promise<Connection>) => {
    const connectionId = typeof connection === 'string' ? connection : (await connection).id;
    const initialState = {
      conn: await ConnectionSettingsService.instance.loadSonarQubeConnection(connectionId)
    };
    initializeAndRevealPanel(context, { mode: 'update', initialState }, SONARQUBE_SERVER_LABEL);
  };
}

export function editSonarCloudConnection(context: vscode.ExtensionContext) {
  return async (connection: string | Promise<Connection>) => {
    const connectionId = typeof connection === 'string' ? connection : (await connection).id;
    const existingConnection= await ConnectionSettingsService.instance.loadSonarCloudConnection(connectionId);
    const initialState = {
      conn: existingConnection,
      userOrganizations: await ConnectionSettingsService.instance.listUserOrganizations(existingConnection.token)
    };
    initializeAndRevealPanel(context, { mode: 'update', initialState }, SONARQUBE_CLOUD_LABEL);
  };
}

function initializeAndRevealPanel(context: vscode.ExtensionContext, renderOptions: RenderOptions, serverProductName: string) {
  lazyCreateConnectionSetupPanel(context, serverProductName);
  connectionSetupPanel.webview.html = renderConnectionSetupPanel(context, connectionSetupPanel.webview, renderOptions);
  finishSetupAndRevealPanel(serverProductName);
}

function finishSetupAndRevealPanel(serverProductName: string) {
  connectionSetupPanel.webview.onDidReceiveMessage(handleMessage);
  connectionSetupPanel.iconPath = {
    light: util.resolveExtensionFile('images', `${serverProductName.toLowerCase()}.svg`),
    dark: util.resolveExtensionFile('images', `${serverProductName.toLowerCase()}_dark.svg`)
  }
  connectionSetupPanel.reveal();
}

export async function reportConnectionCheckResult(result: ConnectionCheckResult) {
  if (connectionSetupPanel?.webview) {
    const command = result.success ? 'connectionCheckSuccess' : 'connectionCheckFailure';
    connectionSetupPanel.webview.postMessage({ command, ...result });
  } else if (result.success) {
    vscode.window.showInformationMessage(`Connection with '${result.connectionId}' was successful!`);
  } else {
    const editConnectionAction = 'Edit Connection';
    const reply = await vscode.window.showErrorMessage(
      `Connection with '${result.connectionId}' failed. Please check your settings.`,
      editConnectionAction
    );
    if (reply === editConnectionAction) {
      vscode.commands.executeCommand(Commands.EDIT_SONARQUBE_CONNECTION, result.connectionId);
    }
  }
}

function lazyCreateConnectionSetupPanel(context: vscode.ExtensionContext, serverProductName) {
  if (!connectionSetupPanel) {
    connectionSetupPanel = vscode.window.createWebviewPanel(
      'sonarlint.ConnectionSetup',
      `${serverProductName} Connection`,
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
  initialState: WebviewInitialState;
}

interface WebviewInitialState {
  conn: SonarQubeConnection | SonarCloudConnection;
  userOrganizations?: Organization[];
}

function renderConnectionSetupPanel(context: vscode.ExtensionContext, webview: vscode.Webview, options: RenderOptions) {
  const resolver = new ResourceResolver(context, webview);
  const styleSrc = resolver.resolve('styles', 'connectionsetup.css');
  const toolkitUri = resolver.resolve('node_modules', '@vscode', 'webview-ui-toolkit', 'dist', 'toolkit.min.js');
  const webviewMainUri = resolver.resolve('webview-ui', 'connectionsetup.js');

  const { mode, initialState } = options;
  const connection = initialState.conn
  const isSonarQube = isSonarQubeConnection(connection);

  const serverProductName = isSonarQube ? SONARQUBE_SERVER_LABEL : SONARQUBE_CLOUD_LABEL;
  const serverDocUrl = isSonarQube ? sonarQubeNotificationsDocUrl : sonarCloudNotificationsDocUrl;

  const initialConnectionId = escapeHtml(connection.connectionId) || '';
  const initialToken = escapeHtml(connection.token);
  const maybeProjectKey = connection.projectKey;
  const saveButtonLabel = maybeProjectKey ? 'Save Connection And Bind Project' : 'Save Connection';

  const isFromSharedConfiguration = connection.isFromSharedConfiguration;
  const maybeFolderUri = connection.folderUri || '';
  const maybeFolderBindingParagraph = renderBindingParagraph(maybeFolderUri, maybeProjectKey);

  return `<!doctype html><html lang="en">
    <head>
      <title>${serverProductName} Connection</title>
      <meta http-equiv="Content-Type" content="text/html;charset=utf-8" />
      <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src ${webview.cspSource}; script-src ${webview.cspSource}"/>
      <link rel="stylesheet" type="text/css" href="${styleSrc}" />
      <script type="module" src="${toolkitUri}"></script>
      <script type="module" src="${webviewMainUri}"></script>
    </head>
    <body>
      <h1>${mode === 'create' ? 'New' : 'Edit'} ${serverProductName} Connection</h1>
      <hr>
      <div>
        ${isSonarQube ? SONARQUBE_DESCRIPTION : SONARCLOUD_DESCRIPTION}
      </div>
      <hr>
      <form id="connectionForm">
        ${renderServerUrlField(initialState)}
        ${renderGenerateTokenButton(connection, serverProductName)}
        <div class="formRowWithStatus">
          <vscode-text-field id="token" type="password" placeholder="········" required size="40"
            title="A user token generated for your account on ${serverProductName}" value="${initialToken}">
            User Token
          </vscode-text-field>
          <span id="tokenStatus" class="hidden">Token received!</span>
          <input type="hidden" id="token-initial" value="${initialToken}" />
        </div>
        ${renderOrganizationKeyField(initialState)}
        <vscode-text-field id="connectionId" type="text" placeholder="My ${serverProductName} Connection" size="40"
          title="Optionally, please give this connection a memorable name. If no name is provided, Sonar will generate one." 
          value="${initialConnectionId}"
          ${options.mode === 'update' ? 'readonly' : ''}>
          Connection Name
        </vscode-text-field>
        <input type="hidden" id="connectionId-initial" value="${initialConnectionId}" />
        <input type="hidden" id="shouldGenerateConnectionId" value="${mode === 'create'}" />
        <input type="hidden" id="projectKey" value="${maybeProjectKey}" />
        <input type="hidden" id="isFromSharedConfiguration" value="${isFromSharedConfiguration}" />
        <input type="hidden" id="folderUri" value="${maybeFolderUri}" />
        <vscode-checkbox id="enableNotifications" ${!connection.disableNotifications ? 'checked' : ''}>
          Receive notifications from ${serverProductName}
        </vscode-checkbox>
        <input type="hidden" id="enableNotifications-initial" value="${!connection.disableNotifications}" />
        <p>
          You will receive
          <vscode-link target="_blank" href="${serverDocUrl}">notifications</vscode-link>
          from ${serverProductName} in situations like:
        </p>
        <ul>
          <li>the Quality Gate status of a bound project changes</li>
          <li>the latest analysis of a bound project on ${serverProductName} raises new issues assigned to you</li>
        </ul>
        <br>
        ${maybeFolderBindingParagraph}
        <br>
        <a href='https://docs.sonarsource.com/sonarqube-for-ide/vs-code/team-features/connected-mode-setup/#connection-setup'>Need help setting up a connection?</a>
        <div id="connectionCheck" class="formRowWithStatus">
          <vscode-button id="saveConnection" disabled>${saveButtonLabel}</vscode-button>
          <span id="connectionProgress" class="hidden">
            <vscode-progress-ring/>
          </span>
          <span id="connectionStatus"></span>
        </div>
      </form>
    </body>
  </html>`;
}

function renderServerUrlField(initialState) {
  if (isSonarQubeConnection(initialState.conn)) {
    const serverUrl = escapeHtml(initialState.conn.serverUrl);
    return `<vscode-text-field id="serverUrl" type="url" placeholder="https://your.sonarqube.server/" required size="40"
    autofocus value="${serverUrl}">
      <b>Server URL</b> <vscode-badge class='tooltip'>i<span class='tooltiptext'>The base URL for your SonarQube Server instance</span></vscode-badge>
    </vscode-text-field><span class='warning'>${serverUrl ? 'Please ensure that your Server URL matches your SonarQube Server instance.' : ''}</span>
    <input type="hidden" id="serverUrl-initial" value="${serverUrl}" />`;
  }
  return '';
}

function renderGenerateTokenButton(connection, serverProductName) {
  const buttonDisabled = isSonarQubeConnection(connection) && connection.serverUrl === '' ? 'disabled' : '';
  return `<div id="tokenGeneration" class="formRowWithStatus">
      <vscode-button id="generateToken" ${buttonDisabled}>
        Generate Token
      </vscode-button>
      <span id="tokenGenerationProgress" class="hidden">
        <vscode-progress-ring/>
      </span>
      <span id="tokenGenerationResult"></span>
    </div>
    <p>
      You can use the button above to generate a user token in your ${serverProductName} settings,
      copy it and paste it in the field below.
    </p>`;
}

function renderOrganizationKeyField(initialState : WebviewInitialState) {
  if (isSonarQubeConnection(initialState.conn)) {
    return '';
  }
  const organizationKey = escapeHtml(initialState.conn.organizationKey);
  let prePopulatedOptions = '';
  if (organizationKey !== '') {
    prePopulatedOptions += `<vscode-option selected>${organizationKey}</vscode-option>`;
  }
  if (initialState.userOrganizations && initialState.userOrganizations.length > 0) {
    for (const userOrganization of initialState.userOrganizations) {
      if (organizationKey !== userOrganization.key) {
        prePopulatedOptions += `<vscode-option>${userOrganization.name}</vscode-option>`;
      }
    }
  }
  return `
    <label for="organizationKey">Organization</label>
    <div class="dropdown-container">    
      <vscode-dropdown id="organizationKey" required position="below">
      ${prePopulatedOptions}
      </vscode-dropdown>
    </div>
    <input type="hidden" id="organizationKey-initial" value="${organizationKey}" />`;
}

function renderBindingParagraph(maybeFolderUri: string, maybeProjectKey: string) {
  if (maybeFolderUri) {
    const folderUri = vscode.Uri.parse(maybeFolderUri);
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(folderUri);
    return `Once the connection is saved, workspace folder '${escapeHtml(workspaceFolder.name)}' will be bound to project '${escapeHtml(maybeProjectKey)}'.`
  }
  return '';
}

async function handleMessage(message) {
  handleMessageWithConnectionSettingsService(message, ConnectionSettingsService.instance);
}

/*
 * Exported for unit tests
 */
const SONARCLOUD_PRODUCT_LINK_COMMAND = 'sonarCloudProductPageLinkClick';
const SONARQUBE_EDITIONS_DOWNLOAD_LINK_COMMAND = 'sonarQubeEditionsDownloadsLinkClick';
const TOKEN_CHANGED_COMMAND = 'tokenChanged';

export async function handleMessageWithConnectionSettingsService(
  message,
  connectionSettingsService: ConnectionSettingsService
) {
  switch (message.command) {
    case OPEN_TOKEN_GENERATION_PAGE_COMMAND:
      await openTokenGenerationPage(message);
      break;
    case SAVE_CONNECTION_COMMAND:
      delete message.command;
      if (!message.disableNotifications) {
        delete message.disableNotifications;
      }
      if (!message.connectionId) {
        message.connectionId = getDefaultConnectionId(message);
      }
      if (message.serverUrl) {
        message.serverUrl = cleanServerUrl(message.serverUrl);
      }
      saveConnection(message, connectionSettingsService);
      break;
    case SONARCLOUD_PRODUCT_LINK_COMMAND:
      delete message.command;
      vscode.commands.executeCommand(Commands.TRIGGER_HELP_AND_FEEDBACK_LINK, 'sonarCloudProductPage');
      break;
    case SONARQUBE_EDITIONS_DOWNLOAD_LINK_COMMAND:
      delete message.command;
      vscode.commands.executeCommand(Commands.TRIGGER_HELP_AND_FEEDBACK_LINK, 'sonarQubeEditionsDownloads');
      break;
    case TOKEN_CHANGED_COMMAND:
      delete message.command;
      await getUserOrganizationsAndUpdateUI(message.token);
      break;
  }
}

export function getDefaultConnectionId(message): string {
  let defaultConnectionId = DEFAULT_CONNECTION_ID;
  if (message.serverUrl) {
    defaultConnectionId = cleanServerUrl(message.serverUrl);
  }
  if (message.organizationKey) {
    defaultConnectionId = message.organizationKey;
  }
  return defaultConnectionId;
}

async function openTokenGenerationPage(message) {
  const { serverUrl } = message;
  const cleanedUrl = cleanServerUrl(serverUrl);
  ConnectionSettingsService.instance
    .generateToken(cleanedUrl)
    .then(async token => {
      await handleTokenReceivedNotification(token);
    })
    .catch(
      async _error =>
        await connectionSetupPanel.webview.postMessage({
          command: 'tokenGenerationPageIsOpen',
          errorMessage: 'Incorrect URL or server is not available'
        })
    );
  await connectionSetupPanel.webview.postMessage({ command: 'tokenGenerationPageIsOpen' });
}

async function saveConnection(
  connection: SonarQubeConnection | SonarCloudConnection,
  connectionSettingsService: ConnectionSettingsService
) {
  const isSQConnection = isSonarQubeConnection(connection);
  const serverOrOrganization = isSQConnection ? connection.serverUrl : connection.organizationKey;

  await connectionSetupPanel.webview.postMessage({ command: 'connectionCheckStart' });
  const connectionCheckResult = await connectionSettingsService.checkNewConnection(
    connection.token,
    serverOrOrganization,
    isSQConnection
  );
  await reportConnectionCheckResult(connectionCheckResult);

  if (!connectionCheckResult.success) {
    return;
  }

  if (isSQConnection) {
    const foundConnection = await connectionSettingsService.loadSonarQubeConnection(connection.connectionId);
    if (foundConnection) {
      await connectionSettingsService.updateSonarQubeConnection(connection);
    } else {
      await connectionSettingsService.addSonarQubeConnection(connection);
    }
  } else {
    const foundConnection = await connectionSettingsService.loadSonarCloudConnection(connection.connectionId);
    if (foundConnection) {
      await connectionSettingsService.updateSonarCloudConnection(connection);
    } else {
      await connectionSettingsService.addSonarCloudConnection(connection);
    }
  }

  if (connection.projectKey && connection.folderUri) {
    const folderUri = vscode.Uri.parse(connection.folderUri);
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(folderUri);
    const bindingCreationMode = connection.isFromSharedConfiguration ? BindingCreationMode.IMPORTED : BindingCreationMode.AUTOMATIC;
    await BindingService.instance.saveBinding(connection.projectKey, workspaceFolder, bindingCreationMode, connection.connectionId);
  }
}

function cleanServerUrl(serverUrl: string) {
  return removeTrailingSlashes(serverUrl.trim());
}

function removeTrailingSlashes(url: string) {
  let cleanedUrl = url;
  while (cleanedUrl.endsWith('/')) {
    cleanedUrl = cleanedUrl.substring(0, cleanedUrl.length - 1);
  }
  return cleanedUrl;
}

export async function handleTokenReceivedNotification(token: string) {
  if (connectionSetupPanel?.active && token) {
    await connectionSetupPanel.webview.postMessage({ command: TOKEN_RECEIVED_COMMAND, token });
    await getUserOrganizationsAndUpdateUI(token);
  }
}

async function getUserOrganizationsAndUpdateUI(token: string) {
  const organizations = await ConnectionSettingsService.instance.listUserOrganizations(token);
  await connectionSetupPanel.webview.postMessage({ command: ORGANIZATION_LIST_RECEIVED_COMMAND, organizations });
}
