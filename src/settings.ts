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
const SONARQUBE_CONNECTIONS_CATEGORY = `${SONARLINT_CATEGORY}.${CONNECTIONS_SECTION}.${SONARQUBE}`;

async function hasUnmigratedConnections(sqConnections: SqConnection[],
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
  const sqConnections = settings.get<SqConnection[]>(`${CONNECTIONS_SECTION}.${SONARQUBE}`);
  if (await hasUnmigratedConnections(sqConnections, settingsService)) {
    suggestMigrationToSecureStorage(sqConnections, settingsService);
  }
}

async function suggestMigrationToSecureStorage(sqConnections: SqConnection[],
  settingsService: ConnectionSettingsService) {
  const remindMeLaterAction = 'Ask me later';
  const migrateToSecureStorageAction = 'Migrate connection settings to secure storage';
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
   * @param serverId SonarQube URL or SonarCloud organization ID
   * @param token auth token
   */
  async storeServerToken(serverId: string, token: string): Promise<void> {
    if (token) {
      this.secretStorage.store(serverId, token);
    }
  }

  async getServerToken(serverId: string): Promise<string | undefined> {
    return this.secretStorage.get(serverId);
  }

  async hasTokenForServer(serverId: string): Promise<boolean> {
    return (await this.getServerToken(serverId)) !== undefined;
  }

  async deleteTokenForServer(serverId: string): Promise<void> {
    return this.secretStorage.delete(serverId);
  }

  getSonarQubeConnections(): SqConnection[] {
    return VSCode.workspace.getConfiguration('sonarlint').get<SqConnection[]>('connectedMode.connections.sonarqube');
  }

  setSonarQubeConnections(sqConnections: SqConnection[]) {
    VSCode.workspace.getConfiguration()
      .update(SONARQUBE_CONNECTIONS_CATEGORY, sqConnections, VSCode.ConfigurationTarget.Global);
  }

  async addSonarQubeConnection(connection: SqConnection) {
    const connections = this.getSonarQubeConnections();
    const connectionForSettings: SqConnection = { serverUrl: connection.serverUrl };
    if (connection.connectionId !== undefined) {
      connectionForSettings.connectionId = connection.connectionId;
    }
    connections.push(connectionForSettings);
    await this.storeServerToken(connection.serverUrl, connection.token);
    VSCode.workspace.getConfiguration()
      .update(SONARQUBE_CONNECTIONS_CATEGORY, connections, VSCode.ConfigurationTarget.Global);
  }

  async addTokensFromSettingsToSecureStorage(sqConnections: SqConnection[]) {
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

type SqConnection = { connectionId?: string, serverUrl?: string, organizationKey?: string, token?: string };
