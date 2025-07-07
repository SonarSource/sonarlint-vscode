/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as VSCode from 'vscode';
import { Connection } from '../connected/connections';
import { SonarLintExtendedLanguageClient } from '../lsp/client';
import { logToSonarLintOutput } from '../util/logging';
import { ConnectionCheckResult } from '../lsp/protocol';
import { sanitizeSonarCloudRegionSetting } from '../util/util';

const SONARLINT_CATEGORY = 'sonarlint';
const CONNECTIONS_SECTION = 'connectedMode.connections';
const SONARQUBE = 'sonarqube';
const SONARCLOUD = 'sonarcloud';
const SONARQUBE_CONNECTIONS_CATEGORY = `${SONARLINT_CATEGORY}.${CONNECTIONS_SECTION}.${SONARQUBE}`;
const SONARCLOUD_CONNECTIONS_CATEGORY = `${SONARLINT_CATEGORY}.${CONNECTIONS_SECTION}.${SONARCLOUD}`;

async function hasUnmigratedConnections(
  sqConnections: SonarQubeConnection[],
  scConnections: SonarCloudConnection[],
  settingsService: ConnectionSettingsService
): Promise<boolean> {
  for (const connection of [...sqConnections, ...scConnections]) {
    if (!(await settingsService.hasTokenForConnection(connection)) && connection.token) {
      return true;
    }
  }
  return false;
}

export async function migrateConnectedModeSettings(
  settings: VSCode.WorkspaceConfiguration,
  settingsService: ConnectionSettingsService
) {
  const sqConnections = settings.get<SonarQubeConnection[]>(`${CONNECTIONS_SECTION}.${SONARQUBE}`, []);
  const scConnections = settings.get<SonarCloudConnection[]>(`${CONNECTIONS_SECTION}.${SONARCLOUD}`, []);
  if (await hasUnmigratedConnections(sqConnections, scConnections, settingsService)) {
    suggestMigrationToSecureStorage(sqConnections, scConnections, settingsService);
  }
}

async function suggestMigrationToSecureStorage(
  sqConnections: SonarQubeConnection[],
  scConnections: SonarCloudConnection[],
  settingsService: ConnectionSettingsService
) {
  const migrateToSecureStorageAction = 'Migrate';
  const message = `SonarQube for VS Code found SonarQube (Server, Cloud) token in settings file.
   Do you want to migrate them to secure storage?`;
  const selection = await VSCode.window.showWarningMessage(message, migrateToSecureStorageAction);
  if (selection === migrateToSecureStorageAction) {
    await settingsService.addTokensFromSettingsToSecureStorage(sqConnections, scConnections);
  }
}

export class ConnectionSettingsService {
  private static _instance: ConnectionSettingsService;
  private readonly connectionCheckResults: Map<string, ConnectionCheckResult>;

  constructor(
    private readonly secretStorage: VSCode.SecretStorage,
    private readonly client: SonarLintExtendedLanguageClient
  ) {
    this.connectionCheckResults = new Map<string, ConnectionCheckResult>();
  }

  static init(context: VSCode.ExtensionContext, client: SonarLintExtendedLanguageClient): void {
    ConnectionSettingsService._instance = new ConnectionSettingsService(context.secrets, client);
  }

  static get instance(): ConnectionSettingsService {
    return ConnectionSettingsService._instance;
  }

  async storeUpdatedConnectionToken(connection: SonarQubeConnection | SonarCloudConnection, token: string) {
    const tokenStorageKey = getTokenStorageKey(connection);
    const existingToken = await this.secretStorage.get(tokenStorageKey);
    if (!existingToken || existingToken !== token) {
      await this.storeServerToken(tokenStorageKey, token);
      return true;
    }
    return false;
  }

  /**
   *
   * @param serverUrlOrOrganizationKey SonarQube URL or SonarCloud organization ID
   * @param token auth token
   */
  async storeServerToken(serverUrlOrOrganizationKey: string, token: string): Promise<void> {
    if (token) {
      await this.secretStorage.store(serverUrlOrOrganizationKey, token);
    }
  }

  async getServerToken(serverUrlOrOrganizationKey: string): Promise<string | undefined> {
    return this.secretStorage.get(serverUrlOrOrganizationKey);
  }

  async hasTokenForConnection(connection: SonarQubeConnection | SonarCloudConnection) {
    return this.hasTokenForServer(getTokenStorageKey(connection));
  }

  async hasTokenForServer(serverUrlOrOrganizationKey: string): Promise<boolean> {
    try {
      const serverToken = await this.getServerToken(serverUrlOrOrganizationKey);
      return serverToken !== undefined;
    } catch (errorWhileFetchingToken) {
      return false;
    }
  }

  async deleteTokenForConnection(connection: SonarQubeConnection | SonarCloudConnection): Promise<void> {
    return this.deleteTokenForServer(getTokenStorageKey(connection));
  }

  async deleteTokenForServer(serverUrlOrOrganizationKey: string): Promise<void> {
    return this.secretStorage.delete(serverUrlOrOrganizationKey);
  }

  hasConnectionConfigured(): boolean {
    return this.getSonarQubeConnections().length > 0 || this.getSonarCloudConnections().length > 0;
  }

  getSonarQubeConnections(): SonarQubeConnection[] {
    return VSCode.workspace
      .getConfiguration(SONARLINT_CATEGORY)
      .get<SonarQubeConnection[]>(`${CONNECTIONS_SECTION}.${SONARQUBE}`);
  }

  setSonarQubeConnections(sqConnections: SonarQubeConnection[]) {
    VSCode.workspace
      .getConfiguration()
      .update(SONARQUBE_CONNECTIONS_CATEGORY, sqConnections, VSCode.ConfigurationTarget.Global);
  }

  async addSonarQubeConnection(connection: SonarQubeConnection) {
    const connections = this.getSonarQubeConnections();
    const newConnection: SonarQubeConnection = { serverUrl: connection.serverUrl };
    if (connection.connectionId !== undefined) {
      newConnection.connectionId = connection.connectionId;
    }
    if (connection.disableNotifications) {
      newConnection.disableNotifications = true;
    }
    await this.storeUpdatedConnectionToken(connection, connection.token);
    connections.push(newConnection);
    await VSCode.workspace
      .getConfiguration()
      .update(SONARQUBE_CONNECTIONS_CATEGORY, connections, VSCode.ConfigurationTarget.Global);

    return newConnection.connectionId;
  }

  async updateSonarQubeConnection(connection: SonarQubeConnection) {
    const connections = this.getSonarQubeConnections();
    const connectionToUpdate = connections.find(c => c.connectionId === connection.connectionId);
    if (!connectionToUpdate) {
      throw new Error(`Could not find connection '${connection.connectionId}' to update`);
    }
    connectionToUpdate.serverUrl = connection.serverUrl;
    if (connection.disableNotifications) {
      connectionToUpdate.disableNotifications = true;
    } else {
      delete connectionToUpdate.disableNotifications;
    }
    const didUpdateToken = await this.storeUpdatedConnectionToken(connection, connection.token);
    if (didUpdateToken) {
      await this.client.onTokenUpdate(connection.connectionId, connection.token);
    }
    delete connectionToUpdate.token;
    VSCode.workspace
      .getConfiguration()
      .update(SONARQUBE_CONNECTIONS_CATEGORY, connections, VSCode.ConfigurationTarget.Global);
  }

  getSonarCloudConnections(): SonarCloudConnection[] {
    const connections = VSCode.workspace
      .getConfiguration(SONARLINT_CATEGORY)
      .get<SonarCloudConnection[]>(`${CONNECTIONS_SECTION}.${SONARCLOUD}`);

    // Default to EU region for existing connections
    return connections.map(c => ({ ...c, region: sanitizeSonarCloudRegionSetting(c.region) }));
  }

  setSonarCloudConnections(scConnections: SonarCloudConnection[]) {
    VSCode.workspace
      .getConfiguration()
      .update(SONARCLOUD_CONNECTIONS_CATEGORY, scConnections, VSCode.ConfigurationTarget.Global);
  }

  async addSonarCloudConnection(connection: SonarCloudConnection) {
    const connections = this.getSonarCloudConnections();
    const newConnection: SonarCloudConnection = { organizationKey: connection.organizationKey };
    if (connection.connectionId !== undefined) {
      newConnection.connectionId = connection.connectionId;
    }
    if (connection.disableNotifications) {
      newConnection.disableNotifications = true;
    }
    newConnection.region = connection.region;
    await this.storeUpdatedConnectionToken(connection, connection.token);
    connections.push(newConnection);
    VSCode.workspace
      .getConfiguration()
      .update(SONARCLOUD_CONNECTIONS_CATEGORY, connections, VSCode.ConfigurationTarget.Global);

    return newConnection.connectionId;
  }

  async updateSonarCloudConnection(connection: SonarCloudConnection) {
    const connections = this.getSonarCloudConnections();
    const connectionToUpdate = connections.find(c => c.connectionId === connection.connectionId);
    if (!connectionToUpdate) {
      throw new Error(`Could not find connection '${connection.connectionId}' to update`);
    }
    connectionToUpdate.organizationKey = connection.organizationKey;
    if (connection.disableNotifications) {
      connectionToUpdate.disableNotifications = true;
    } else {
      delete connectionToUpdate.disableNotifications;
    }
    const didUpdateToken = await this.storeUpdatedConnectionToken(connection, connection.token);
    if (didUpdateToken) {
      await this.client.onTokenUpdate(connection.connectionId, connection.token);
    }
    delete connectionToUpdate.token;
    VSCode.workspace
      .getConfiguration()
      .update(SONARCLOUD_CONNECTIONS_CATEGORY, connections, VSCode.ConfigurationTarget.Global);
  }

  async addTokensFromSettingsToSecureStorage(
    sqConnections: SonarQubeConnection[],
    scConnections: SonarCloudConnection[]
  ) {
    await Promise.all(
      [...sqConnections, ...scConnections].map(async c => {
        if (c.token !== undefined && !(await this.hasTokenForConnection(c))) {
          await this.storeUpdatedConnectionToken(c, c.token);
          c.token = undefined;
        }
      })
    );
    await updateConfigIfNotEmpty(sqConnections, SONARQUBE_CONNECTIONS_CATEGORY);
    await updateConfigIfNotEmpty(scConnections, SONARCLOUD_CONNECTIONS_CATEGORY);
  }

  async loadSonarQubeConnection(connectionId: string): Promise<SonarQubeConnection> {
    const allSonarQubeConnections = this.getSonarQubeConnections();
    const loadedConnection = allSonarQubeConnections.find(c => c.connectionId === connectionId);
    if (loadedConnection) {
      loadedConnection.token = await this.getServerToken(loadedConnection.serverUrl);
    }
    return loadedConnection;
  }

  async loadSonarCloudConnection(connectionId: string): Promise<SonarCloudConnection> {
    const allSonarCloudConnections = this.getSonarCloudConnections();
    const loadedConnection = allSonarCloudConnections.find(c => c.connectionId === connectionId);
    if (loadedConnection) {
      const tokenStorageKey = getTokenStorageKey(loadedConnection);
      loadedConnection.token = await this.getServerToken(tokenStorageKey);
    }
    return loadedConnection;
  }

  async removeConnection(connectionItem: Promise<Connection>) {
    const connection = await connectionItem;

    const isSonarQube = connection.contextValue === 'sonarqubeConnection';

    const deleteAction = 'Delete';
    const confirm = await VSCode.window.showWarningMessage(
      `Are you sure you want to delete ${isSonarQube ? 'SonarQube Server' : 'SonarQube Cloud'} connection '${
        connection.id
      }' and project bindings related to it?`,
      { modal: true },
      deleteAction
    );
    if (confirm !== deleteAction) {
      return false;
    }

    if (isSonarQube) {
      const sqConnections = this.getSonarQubeConnections();
      const matchingConnectionIndex = sqConnections.findIndex(c => c.connectionId === connection.id);
      if (matchingConnectionIndex === -1) {
        showSaveSettingsWarning();
        return false;
      }
      const foundConnection = sqConnections[matchingConnectionIndex];
      await this.deleteTokenForConnection(foundConnection);
      sqConnections.splice(matchingConnectionIndex, 1);
      this.setSonarQubeConnections(sqConnections);
    } else {
      const scConnections = this.getSonarCloudConnections();
      const matchingConnectionIndex = scConnections.findIndex(c => c.connectionId === connection.id);
      if (matchingConnectionIndex === -1) {
        showSaveSettingsWarning();
        return false;
      }
      const foundConnection = scConnections[matchingConnectionIndex];
      await this.deleteTokenForConnection(foundConnection);
      scConnections.splice(matchingConnectionIndex, 1);
      this.setSonarCloudConnections(scConnections);
    }
    this.connectionCheckResults.delete(connection.id);
    return true;
  }

  async generateToken(baseServerUrl: string) {
    const { token } = await this.client.generateToken(baseServerUrl);
    if (!token) {
      logToSonarLintOutput(`Could not automatically generate server token for generation params: ${baseServerUrl}`);
    }
    return token;
  }

  async checkNewConnection(
    token: string,
    serverOrOrganization: string,
    isSonarQube: boolean,
    region: SonarCloudRegion
  ) {
    return this.client.checkNewConnection(token, serverOrOrganization, isSonarQube, region);
  }

  reportConnectionCheckResult(connectionCheckResult: ConnectionCheckResult) {
    this.connectionCheckResults.set(connectionCheckResult.connectionId, connectionCheckResult);
  }

  getStatusForConnection(connectionId: string) {
    return this.connectionCheckResults.get(connectionId);
  }

  listUserOrganizations(token: string, region: string) {
    return this.client.listUserOrganizations(token, region);
  }
}

function showSaveSettingsWarning() {
  const saveSettings =
    'You are trying to delete connection with modified settings file.' +
    ' Please save your settings file and try again.';
  VSCode.window.showWarningMessage(saveSettings);
}

export interface BaseConnection {
  token?: string;
  connectionId?: string;
  disableNotifications?: boolean;
  connectionCheckResult?: Promise<ConnectionCheckResult>;
  projectKey?: string;
  isFromSharedConfiguration?: boolean;
  folderUri?: string;
}

export interface SonarQubeConnection extends BaseConnection {
  serverUrl: string;
}

export type SonarCloudRegion = 'EU' | 'US';

export interface SonarCloudConnection extends BaseConnection {
  organizationKey: string;
  region?: SonarCloudRegion;
}

export function isSonarQubeConnection(connection: BaseConnection): connection is SonarQubeConnection {
  return (connection as SonarQubeConnection).serverUrl !== undefined;
}
export function getTokenStorageKey(connection: SonarQubeConnection | SonarCloudConnection) {
  const regionPrefix = !isSonarQubeConnection(connection) && connection.region ? `${connection.region}_` : '';
  return isSonarQubeConnection(connection) ? connection.serverUrl : regionPrefix + connection.organizationKey;
}

async function updateConfigIfNotEmpty(connections, configCategory) {
  if (connections.length > 0) {
    await VSCode.workspace.getConfiguration().update(configCategory, connections, VSCode.ConfigurationTarget.Global);
  }
}