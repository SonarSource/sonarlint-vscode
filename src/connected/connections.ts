/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as VSCode from 'vscode';
import { BindingService } from './binding';
import { SonarLintExtendedLanguageClient } from '../lsp/client';
import { ConnectionCheckResult } from '../lsp/protocol';
import { BaseConnection, ConnectionSettingsService, SonarCloudConnection } from '../settings/connectionsettings';
import { DEFAULT_CONNECTION_ID } from '../commons';
import { isDogfoodingEnvironment } from '../util/dogfoodingUtils';

type ConnectionStatus = 'ok' | 'notok' | 'loading';

export class WorkspaceFolderItem extends VSCode.TreeItem {
  constructor(
    public readonly name: string,
    public readonly uri: VSCode.WorkspaceFolder,
    public readonly connectionId: string,
    public readonly serverType: ServerType
  ) {
    super(name, VSCode.TreeItemCollapsibleState.None);
    this.iconPath = VSCode.ThemeIcon.Folder;
    this.contextValue = 'workspaceFolder';
  }
}

export class RemoteProject extends VSCode.TreeItem {
  constructor(
    public readonly connectionId: string,
    public readonly key: string,
    public readonly serverType: ServerType,
    public readonly name?: string
  ) {
    super(name || '<project not found>', VSCode.TreeItemCollapsibleState.Expanded);
    this.description = key;
    this.iconPath = new VSCode.ThemeIcon(name ? 'cloud' : 'question');
    this.contextValue = 'remoteProject';
  }
}

export class Connection extends VSCode.TreeItem {
  constructor(
    public readonly id: string,
    public readonly label: string,
    public readonly contextValue: 'sonarqubeConnection' | 'sonarcloudConnection',
    public status: ConnectionStatus
  ) {
    super(label, VSCode.TreeItemCollapsibleState.Collapsed);
  }

  collapsibleState = VSCode.TreeItemCollapsibleState.Collapsed;

  iconPath = this.getIconPath();

  private getIconPath() {
    if (this.status === 'ok') {
      return new VSCode.ThemeIcon('pass', new VSCode.ThemeColor('debugIcon.pauseForeground'));
    } else if (this.status === 'notok') {
      return new VSCode.ThemeIcon('error', new VSCode.ThemeColor('testing.iconFailed'));
    }
    return new VSCode.ThemeIcon('circle-large-outline', new VSCode.ThemeColor('debugConsole.warningForeground'));
  }

  public refresh() {
    this.iconPath = this.getIconPath();
  }
}

type ConnectionType = '__sonarqube__' | '__sonarcloud__';

export class ConnectionGroup extends VSCode.TreeItem {
  constructor(
    public readonly id: ConnectionType,
    public readonly label: 'SonarQube Server' | 'SonarQube Cloud',
    public readonly contextValue: 'sonarQubeGroup' | 'sonarCloudGroup'
  ) {
    super(label, VSCode.TreeItemCollapsibleState.Collapsed);
  }
}

export type ConnectionsNode = Connection | ConnectionGroup | RemoteProject | WorkspaceFolderItem;

export class AllConnectionsTreeDataProvider implements VSCode.TreeDataProvider<ConnectionsNode> {
  private readonly _onDidChangeTreeData = new VSCode.EventEmitter<Connection | undefined>();
  readonly onDidChangeTreeData: VSCode.Event<ConnectionsNode | undefined> = this._onDidChangeTreeData.event;
  private allConnections = { sonarqube: Array.from<Connection>([]), sonarcloud: Array.from<Connection>([]) };

  constructor(private readonly client: SonarLintExtendedLanguageClient) {}

  async getConnections(type: ConnectionType): Promise<Connection[]> {
    const contextValue = type === '__sonarqube__' ? 'sonarqubeConnection' : 'sonarcloudConnection';
    const labelKey = 'connectionId';
    const alternativeLabelKey = type === '__sonarqube__' ? 'serverUrl' : 'organizationKey';

    const connectionsFromSettings: BaseConnection[] =
      type === '__sonarqube__'
        ? ConnectionSettingsService.instance.getSonarQubeConnections()
        : ConnectionSettingsService.instance.getSonarCloudConnections();
    const connections = await Promise.all(
      connectionsFromSettings.map(async c => {
        // Display the region prefix in case user has more than 1 SonarQube Cloud connections, and the region is set
        // TODO check the region and default to EU if invalid
        const regionPrefix = 
          isDogfoodingEnvironment() &&
          type !== '__sonarqube__'
          && connectionsFromSettings.length > 1
          && (c as SonarCloudConnection).region
            ? `[${(c as SonarCloudConnection).region}] ` : '';
        const label = c[labelKey] ? c[labelKey] : c[alternativeLabelKey];
        let status: ConnectionStatus = 'loading';
        const connectionId: string = c.connectionId ? c.connectionId : DEFAULT_CONNECTION_ID;
        try {
          const connectionCheckResult = ConnectionSettingsService.instance.getStatusForConnection(connectionId);
          if (connectionCheckResult?.success) {
            status = 'ok';
          } else if (connectionCheckResult && !/unknown/.test(connectionCheckResult.reason)) {
            status = 'notok';
          }
        } catch (e) {
          console.log(e);
        }
        return new Connection(c.connectionId, regionPrefix.concat(label), contextValue, status);
      })
    );

    this.allConnections[type] = connections;
    return connections;
  }

  async checkConnection(connectionId) {
    return this.client.checkConnection(connectionId);
  }

  refresh(connection?: Connection) {
    if (connection) {
      this._onDidChangeTreeData.fire(connection);
    } else {
      this._onDidChangeTreeData.fire(null);
    }
  }

  getTreeItem(element: Connection): VSCode.TreeItem {
    return element;
  }

  async getChildren(element?: ConnectionsNode): Promise<ConnectionsNode[]> {
    if (!element) {
      return this.getInitialState();
    } else if (element.contextValue === 'sonarQubeGroup') {
      return this.getConnections('__sonarqube__');
    } else if (element.contextValue === 'sonarCloudGroup') {
      return this.getConnections('__sonarcloud__');
    } else if (element.contextValue === 'sonarqubeConnection' || element.contextValue === 'sonarcloudConnection') {
      const connection = element as Connection;
      const serverType = element.contextValue === 'sonarqubeConnection' ? 'SonarQube' : 'SonarCloud';
      return this.getBoundProjects(connection.id, serverType);
    } else if (element.contextValue === 'remoteProject') {
      const project = element as RemoteProject;
      return this.getWorkspaceFoldersBoundTo(project.connectionId, project.key, project.serverType);
    }
    return null;
  }

  async getBoundProjects(connectionId, serverType) {
    const boundProjects = BindingService.instance.getAllBindings().get(connectionId || DEFAULT_CONNECTION_ID);
    if (!boundProjects) {
      return [];
    }
    const allKeys = [...boundProjects.keys()];
    const keysToNames = await this.client.getRemoteProjectNamesByKeys(connectionId || DEFAULT_CONNECTION_ID, allKeys);
    return allKeys.map(k => new RemoteProject(connectionId, k, serverType, keysToNames[k]));
  }

  getWorkspaceFoldersBoundTo(connectionId, projectKey, serverType) {
    const boundProjects = BindingService.instance.getAllBindings().get(connectionId || DEFAULT_CONNECTION_ID);
    if (!boundProjects) {
      return [];
    }
    const boundFolders = boundProjects.get(projectKey);
    if (!boundFolders) {
      return [];
    }
    return boundFolders.map(f => new WorkspaceFolderItem(f.folder.name, f.folder, connectionId, serverType));
  }

  getInitialState(): ConnectionGroup[] {
    const sqConnections = ConnectionSettingsService.instance.getSonarQubeConnections();
    const scConnections = ConnectionSettingsService.instance.getSonarCloudConnections();
    return [
      sqConnections.length > 0 ? new ConnectionGroup('__sonarqube__', 'SonarQube Server', 'sonarQubeGroup') : null,
      scConnections.length > 0 ? new ConnectionGroup('__sonarcloud__', 'SonarQube Cloud', 'sonarCloudGroup') : null
    ];
  }

  reportConnectionCheckResult(checkResult: ConnectionCheckResult) {
    if (checkResult.connectionId === DEFAULT_CONNECTION_ID) {
      checkResult.connectionId = undefined;
    }
    const allConnections = [...this.allConnections.sonarqube, ...this.allConnections.sonarcloud];
    const connectionToUpdate = allConnections.find(c => c.id === checkResult.connectionId);
    if (connectionToUpdate) {
      connectionToUpdate.status = checkResult.success ? 'ok' : 'notok';
      connectionToUpdate.refresh();
      this.refresh(connectionToUpdate);
    }
  }
}

export type ServerType = 'SonarQube' | 'SonarCloud';
