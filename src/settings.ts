/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as VSCode from 'vscode';
import { ExtensionContext } from 'vscode';

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
  switch (selection) {
    case migrateToSecureStorageAction:
      await settingsService.addTokensFromSettingsToSecureStorage(sqConnections);
      break;
    case remindMeLaterAction:
  }
}

export function getSonarLintConfiguration(): VSCode.WorkspaceConfiguration {
  return VSCode.workspace.getConfiguration(SONARLINT_CATEGORY);
}


export class ConnectionSettingsService {

  private static instance: ConnectionSettingsService;

  constructor(private readonly secretStorage: VSCode.SecretStorage) {
  }

  static init(context: ExtensionContext): void {
    ConnectionSettingsService.instance = new ConnectionSettingsService(context.secrets);
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
    delete connection.token;
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
    delete connectionToUpdate.token;
    VSCode.workspace.getConfiguration()
      .update(SONARQUBE_CONNECTIONS_CATEGORY, connections, VSCode.ConfigurationTarget.Global);
  }

  getSonarCloudConnections(): SonarCloudConnection[] {
    return VSCode.workspace.getConfiguration(SONARLINT_CATEGORY)
      .get<SonarCloudConnection[]>(`${CONNECTIONS_SECTION}.${SONARCLOUD}`);
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
