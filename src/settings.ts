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
                                        settingsService: ConnectionSettingsService): Promise<boolean> {
  for (const connection of sqConnections) {
    if (!await settingsService.hasTokenForServer(connection.serverUrl)) {
      return true;
    }
  }
  return false;
}

export async function migrateConnectedModeSettings(settings: VSCode.WorkspaceConfiguration,
  settingsService: ConnectionSettingsService) {
  const sqConnections = settings.get<SonarQubeConnection[]>(`${CONNECTIONS_SECTION}.${SONARQUBE}`);
  if (await hasUnmigratedConnections(sqConnections, settingsService)) {
    suggestMigrationToSecureStorage(sqConnections, settingsService);
  }
}

async function suggestMigrationToSecureStorage(sqConnections: SonarQubeConnection[],
  settingsService: ConnectionSettingsService) {
  const remindMeLaterAction = 'Ask me later';
  const migrateToSecureStorageAction = 'Migrate';
  const message = `SonarLint found SonarQube token in settings file. Do you want to migrate them to secure storage?`;
  const selection = await VSCode.window.showWarningMessage(message, migrateToSecureStorageAction, remindMeLaterAction);
  if (selection === migrateToSecureStorageAction) {
    await settingsService.addTokensFromSettingsToSecureStorage(sqConnections);
  }
}

export function getSonarLintConfiguration(): VSCode.WorkspaceConfiguration {
  return VSCode.workspace.getConfiguration(SONARLINT_CATEGORY);
}


export class ConnectionSettingsService {

  private static instance: ConnectionSettingsService;

  constructor(
    private readonly secretStorage: VSCode.SecretStorage,
    private readonly client: SonarLintExtendedLanguageClient
  ) {
  }

  static init(context: VSCode.ExtensionContext, client: SonarLintExtendedLanguageClient): void {
    ConnectionSettingsService.instance = new ConnectionSettingsService(context.secrets, client);
  }

  static get getInstance(): ConnectionSettingsService {
    return ConnectionSettingsService.instance;
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

  async addTokensFromSettingsToSecureStorage(sqConnections: SonarQubeConnection[]) {
    await Promise.all(
      sqConnections.map(async c => {
        if (c.token !== undefined && !await this.hasTokenForServer(c.serverUrl)) {
          await this.storeServerToken(c.serverUrl, c.token);
          c.token = undefined;
        }
      })
    );
    return VSCode.workspace.getConfiguration()
      .update(SONARQUBE_CONNECTIONS_CATEGORY, sqConnections, VSCode.ConfigurationTarget.Global);
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
  const saveSettings = 'You trying to delete connection with modified settings file.' +
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
