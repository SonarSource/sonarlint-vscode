/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as VSCode from 'vscode';
import { Connection } from './connections';
import { SonarLintExtendedLanguageClient } from './client';

const SONARLINT_CATEGORY = 'sonarlint';
const CONNECTIONS_SECTION = 'connectedMode.connections';
const SONARQUBE = 'sonarqube';
const SONARCLOUD = 'sonarcloud';
const SONARQUBE_CONNECTIONS_CATEGORY = `${SONARLINT_CATEGORY}.${CONNECTIONS_SECTION}.${SONARQUBE}`;
const SONARCLOUD_CONNECTIONS_CATEGORY = `${SONARLINT_CATEGORY}.${CONNECTIONS_SECTION}.${SONARCLOUD}`;

async function hasUnmigratedConnections(sqConnections: SonarQubeConnection[],
                                        scConnections: SonarCloudConnection[],
                                        settingsService: ConnectionSettingsService): Promise<boolean> {
  for (const connection of sqConnections) {
    if (!await settingsService.hasTokenForServer(connection.serverUrl) && connection.token) {
      return true;
    }
  }
  for (const connection of scConnections) {
    if (!await settingsService.hasTokenForServer(connection.organizationKey)) {
      return true;
    }
  }
  return false;
}

export async function migrateConnectedModeSettings(settings: VSCode.WorkspaceConfiguration,
  settingsService: ConnectionSettingsService) {
  const sqConnections = settings.get<SonarQubeConnection[]>(`${CONNECTIONS_SECTION}.${SONARQUBE}`);
  const scConnections = settings.get<SonarCloudConnection[]>(`${CONNECTIONS_SECTION}.${SONARCLOUD}`);
  if (await hasUnmigratedConnections(sqConnections, scConnections, settingsService)) {
    suggestMigrationToSecureStorage(sqConnections, scConnections, settingsService);
  }
}

async function suggestMigrationToSecureStorage(
    sqConnections: SonarQubeConnection[],
    scConnections: SonarCloudConnection[],
    settingsService: ConnectionSettingsService
  ) {
  const remindMeLaterAction = 'Ask me later';
  const migrateToSecureStorageAction = 'Migrate';
  const message = `SonarLint found SonarQube/SonarCloud token in settings file.
   Do you want to migrate them to secure storage?`;
  const selection = await VSCode.window.showWarningMessage(message, migrateToSecureStorageAction, remindMeLaterAction);
  if (selection === migrateToSecureStorageAction) {
    await settingsService.addTokensFromSettingsToSecureStorage(sqConnections, scConnections);
  }
}

export function getSonarLintConfiguration(): VSCode.WorkspaceConfiguration {
  return VSCode.workspace.getConfiguration(SONARLINT_CATEGORY);
}


export class ConnectionSettingsService {

  private static _instance: ConnectionSettingsService;

  constructor(
    private readonly secretStorage: VSCode.SecretStorage,
    private readonly client: SonarLintExtendedLanguageClient
  ) {
  }

  static init(context: VSCode.ExtensionContext, client: SonarLintExtendedLanguageClient): void {
    ConnectionSettingsService._instance = new ConnectionSettingsService(context.secrets, client);
  }

  static get instance(): ConnectionSettingsService {
    return ConnectionSettingsService._instance;
  }

  /**
   *
   * @param serverUrlOrOrganizationKey SonarQube URL or SonarCloud organization ID
   * @param token auth token
   */
  async storeServerToken(serverUrlOrOrganizationKey: string, token: string): Promise<void> {
    if (token) {
      this.secretStorage.store(serverUrlOrOrganizationKey, token);
    }
  }

  async getServerToken(serverUrlOrOrganizationKey: string): Promise<string | undefined> {
    return this.secretStorage.get(serverUrlOrOrganizationKey);
  }

  async hasTokenForServer(serverUrlOrOrganizationKey: string): Promise<boolean> {
    try {
      const serverToken = await this.getServerToken(serverUrlOrOrganizationKey);
      return serverToken !== undefined;
    } catch(errorWhileFetchingToken) {
      return false;
    }
  }

  async deleteTokenForServer(serverUrlOrOrganizationKey: string): Promise<void> {
    return this.secretStorage.delete(serverUrlOrOrganizationKey);
  }

  getSonarQubeConnections(): SonarQubeConnection[] {
    return VSCode.workspace.getConfiguration(SONARLINT_CATEGORY)
      .get<SonarQubeConnection[]>(`${CONNECTIONS_SECTION}.${SONARQUBE}`);
  }

  setSonarQubeConnections(sqConnections: SonarQubeConnection[]) {
    VSCode.workspace.getConfiguration()
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
    await this.storeServerToken(connection.serverUrl, connection.token);
    connections.push(newConnection);
    VSCode.workspace.getConfiguration()
      .update(SONARQUBE_CONNECTIONS_CATEGORY, connections, VSCode.ConfigurationTarget.Global);
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
    await this.storeServerToken(connection.serverUrl, connection.token);
    this.client.onTokenUpdate();
    delete connectionToUpdate.token;
    VSCode.workspace.getConfiguration()
      .update(SONARQUBE_CONNECTIONS_CATEGORY, connections, VSCode.ConfigurationTarget.Global);
  }

  getSonarCloudConnections(): SonarCloudConnection[] {
    return VSCode.workspace.getConfiguration(SONARLINT_CATEGORY)
      .get<SonarCloudConnection[]>(`${CONNECTIONS_SECTION}.${SONARCLOUD}`);
  }

  setSonarCloudConnections(scConnections: SonarCloudConnection[]) {
    VSCode.workspace.getConfiguration()
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
    await this.storeServerToken(connection.organizationKey, connection.token);
    connections.push(newConnection);
    VSCode.workspace.getConfiguration()
      .update(SONARCLOUD_CONNECTIONS_CATEGORY, connections, VSCode.ConfigurationTarget.Global);
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
    await this.storeServerToken(connection.organizationKey, connection.token);
    this.client.onTokenUpdate();
    delete connectionToUpdate.token;
    VSCode.workspace.getConfiguration()
      .update(SONARCLOUD_CONNECTIONS_CATEGORY, connections, VSCode.ConfigurationTarget.Global);
  }

  async addTokensFromSettingsToSecureStorage(
      sqConnections: SonarQubeConnection[],
      scConnections: SonarCloudConnection[]
  ) {
    await Promise.all(
      sqConnections.map(async c => {
        if (c.token !== undefined && !await this.hasTokenForServer(c.serverUrl)) {
          await this.storeServerToken(c.serverUrl, c.token);
          c.token = undefined;
        }
      })
    );
    await Promise.all(
      scConnections.map(async c => {
        if (c.token !== undefined && !await this.hasTokenForServer(c.organizationKey)) {
          await this.storeServerToken(c.organizationKey, c.token);
          c.token = undefined;
        }
      })
    );
    await VSCode.workspace.getConfiguration()
      .update(SONARQUBE_CONNECTIONS_CATEGORY, sqConnections, VSCode.ConfigurationTarget.Global);
    await VSCode.workspace.getConfiguration()
      .update(SONARCLOUD_CONNECTIONS_CATEGORY, scConnections, VSCode.ConfigurationTarget.Global);
  }

  async loadSonarQubeConnection(connectionId: string) {
    const allSonarQubeConnections = this.getSonarQubeConnections();
    const loadedConnection = allSonarQubeConnections.find(c => c.connectionId === connectionId);
    if (loadedConnection) {
      loadedConnection.token = await this.getServerToken(loadedConnection.serverUrl);
    }
    return loadedConnection;
  }

  async loadSonarCloudConnection(connectionId: string) {
    const allSonarCloudConnections = this.getSonarCloudConnections();
    const loadedConnection = allSonarCloudConnections.find(c => c.connectionId === connectionId);
    if (loadedConnection) {
      loadedConnection.token = await this.getServerToken(loadedConnection.organizationKey);
    }
    return loadedConnection;
  }

  async removeConnection(connectionItem: Promise<Connection>) {
    const connection = await connectionItem;

    const isSonarQube = connection.contextValue === 'sonarqubeConnection';

    const deleteAction = 'Delete';
    const confirm = await VSCode.window.showWarningMessage(
      `Are you sure you want to delete ${isSonarQube ? 'SonarQube' : 'SonarCloud'} connection '${connection.id}'?`,
      { modal: true },
      deleteAction
    );
    if (confirm !== deleteAction) {
      return;
    }

    if (isSonarQube) {
      const sqConnections = this.getSonarQubeConnections();
      const matchingConnectionIndex = sqConnections.findIndex(c => c.connectionId === connection.id);
      if (matchingConnectionIndex === -1) {
        showSaveSettingsWarning();
        return;
      }
      const foundConnection = sqConnections[matchingConnectionIndex];
      await this.deleteTokenForServer(foundConnection.serverUrl);
      sqConnections.splice(matchingConnectionIndex, 1);
      this.setSonarQubeConnections(sqConnections);
    } else {
      const scConnections = this.getSonarCloudConnections();
      const matchingConnectionIndex = scConnections.findIndex(c => c.connectionId === connection.id);
      if (matchingConnectionIndex === -1) {
        showSaveSettingsWarning();
        return;
      }
      const foundConnection = scConnections[matchingConnectionIndex];
      await this.deleteTokenForServer(foundConnection.organizationKey);
      scConnections.splice(matchingConnectionIndex, 1);
      this.setSonarCloudConnections(scConnections);
    }
  }
}

function showSaveSettingsWarning() {
  const saveSettings = 'You are trying to delete connection with modified settings file.' +
    ' Please save your settings file and try again.';
  VSCode.window.showWarningMessage(saveSettings);
}

export interface BaseConnection {
  token?: string;
  connectionId?: string;
  disableNotifications?: boolean;
}

export interface SonarQubeConnection extends BaseConnection {
  serverUrl: string;
}

export interface SonarCloudConnection extends BaseConnection {
  organizationKey: string;
}

export function isSonarQubeConnection(connection: BaseConnection): connection is SonarQubeConnection {
  return (connection as SonarQubeConnection).serverUrl !== undefined;
}
