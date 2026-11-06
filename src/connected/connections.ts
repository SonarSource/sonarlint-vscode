/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as VSCode from 'vscode';
import { BindingService } from './binding';
import { SonarLintExtendedLanguageClient } from '../lsp/client';
import { ConnectionCheckResult, ExtendedServer } from '../lsp/protocol';
import { BaseConnection, ConnectionSettingsService, SonarCloudConnection } from '../settings/connectionsettings';
import { DEFAULT_CONNECTION_ID } from '../commons';
import { describeMissingConnection, missingConnectionOf } from './missingConnection';

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

/**
 * A leaf representing a `.sonar-config.json`-declared sub-project: a configuration scope bound purely on the
 * language server's backend, with no corresponding `connectedMode.project` VS Code setting and no real
 * `VSCode.WorkspaceFolder` of its own — so, unlike `WorkspaceFolderItem`, it's identified by its scope URI and
 * labelled with its folder name like `WorkspaceFolderItem`, showing the folder's relative path for clarity.
 */
export class ConfigScopeItem extends VSCode.TreeItem {
  constructor(
    public readonly scopeUri: string,
    public readonly projectKey: string,
    public readonly connectionId: string,
    public readonly relativePath: string
  ) {
    super(VSCode.Uri.parse(scopeUri).path.replace(/\/$/, '').split('/').pop() || projectKey, VSCode.TreeItemCollapsibleState.None);
    this.description = relativePath;
    this.iconPath = VSCode.ThemeIcon.Folder;
    this.contextValue = 'configScope';
  }
}

export class UnresolvedBindingsGroup extends VSCode.TreeItem {
  constructor() {
    super('Needs attention', VSCode.TreeItemCollapsibleState.Expanded);
    this.description = 'no matching connection';
    this.tooltip =
      'These folders are declared bound to a SonarQube Server or SonarQube Cloud project, but no connection matches, ' +
      'so they are not bound. Use the button of a folder to create the missing connection.';
    this.iconPath = new VSCode.ThemeIcon('warning', new VSCode.ThemeColor('list.warningForeground'));
    this.contextValue = 'unresolvedBindingsGroup';
  }
}

const CONTEXT_SUFFIX_OF_MISSING_CONNECTION = { sonarqube: 'Server', sonarcloud: 'Cloud', unknown: 'Unknown' };

export class UnresolvedBindingItem extends VSCode.TreeItem {
  constructor(public readonly binding: ExtendedServer.BindingInfo) {
    super(
      VSCode.Uri.parse(binding.scopeUri).path.replace(/\/$/, '').split('/').pop() || binding.name,
      VSCode.TreeItemCollapsibleState.None
    );
    const missing = describeMissingConnection(binding);
    this.description = `${binding.projectKey}, no connection for ${missing}`;
    this.tooltip = `'${binding.projectKey}' is not bound: no connection is configured for ${missing}`;
    this.iconPath = new VSCode.ThemeIcon('warning', new VSCode.ThemeColor('list.warningForeground'));
    this.contextValue = `unresolvedBinding${CONTEXT_SUFFIX_OF_MISSING_CONNECTION[missingConnectionOf(binding).kind]}`;
  }
}

/**
 * A project bound on a connection. Its name is looked up on the server after the node is shown: `undefined` while that
 * is pending, `null` when the server does not know the project.
 */
export class RemoteProject extends VSCode.TreeItem {
  constructor(
    public readonly connectionId: string,
    public readonly key: string,
    public readonly serverType: ServerType,
    public readonly name?: string | null,
    lookupFailed = false
  ) {
    super(name || (name === null ? '<project not found>' : key), VSCode.TreeItemCollapsibleState.Expanded);
    this.description = name === undefined ? undefined : key;
    this.iconPath = RemoteProject.iconOf(name, lookupFailed);
    this.tooltip = lookupFailed ? `Could not load the name of '${key}' from the server` : undefined;
    this.contextValue = 'remoteProject';
  }

  private static iconOf(name: string | null | undefined, lookupFailed: boolean) {
    if (name) {
      return new VSCode.ThemeIcon('cloud');
    }
    return new VSCode.ThemeIcon(name === undefined && !lookupFailed ? 'loading~spin' : 'question');
  }
}

export class Connection extends VSCode.TreeItem {
  constructor(
    public readonly id: string,
    public readonly label: string,
    public readonly contextValue: 'sonarqubeConnection' | 'sonarcloudConnection',
    public status: ConnectionStatus
  ) {
    super(label, VSCode.TreeItemCollapsibleState.Expanded);
  }

  collapsibleState = VSCode.TreeItemCollapsibleState.Expanded;

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

export type ConnectionType = '__sonarqube__' | '__sonarcloud__';

function projectNameCacheKey(connectionId: string, projectKey: string) {
  return `${connectionId || DEFAULT_CONNECTION_ID}\u0000${projectKey}`;
}

export class ConnectionGroup extends VSCode.TreeItem {
  constructor(
    public readonly id: ConnectionType,
    public readonly label: 'SonarQube Server' | 'SonarQube Cloud',
    public readonly contextValue: 'sonarQubeGroup' | 'sonarCloudGroup'
  ) {
    super(label, VSCode.TreeItemCollapsibleState.Expanded);
  }
}

export type ConnectionsNode =
  | Connection
  | ConnectionGroup
  | RemoteProject
  | WorkspaceFolderItem
  | ConfigScopeItem
  | UnresolvedBindingsGroup
  | UnresolvedBindingItem;

export class AllConnectionsTreeDataProvider implements VSCode.TreeDataProvider<ConnectionsNode> {
  private readonly _onDidChangeTreeData = new VSCode.EventEmitter<Connection | undefined>();
  readonly onDidChangeTreeData: VSCode.Event<ConnectionsNode | undefined> = this._onDidChangeTreeData.event;
  private allConnections = { __sonarqube__: Array.from<Connection>([]), __sonarcloud__: Array.from<Connection>([]) };

  private readonly projectNames = new Map<string, string | null>();
  private readonly projectNamesBeingLoaded = new Set<string>();
  private readonly failedProjectNames = new Set<string>();

  constructor(private readonly client: SonarLintExtendedLanguageClient) {
    BindingService.instance.onDidChangeBindings(() => {
      this.failedProjectNames.clear();
      this.refresh();
    });
  }

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
        // Display the region prefix when there is more than one SonarQube Cloud connection and the region is set
        const regionPrefix =
          type !== '__sonarqube__' && connectionsFromSettings.length > 1 && (c as SonarCloudConnection).region
            ? `[${(c as SonarCloudConnection).region}] `
            : '';
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
      const unresolved = BindingService.instance.unresolvedBindings();
      return unresolved.length > 0 ? [...this.getInitialState(), new UnresolvedBindingsGroup()] : this.getInitialState();
    } else if (element.contextValue === 'unresolvedBindingsGroup') {
      return BindingService.instance.unresolvedBindings().map(binding => new UnresolvedBindingItem(binding));
    } else if (element.contextValue === 'sonarQubeGroup') {
      return this.getConnections('__sonarqube__');
    } else if (element.contextValue === 'sonarCloudGroup') {
      return this.getConnections('__sonarcloud__');
    } else if (element.contextValue === 'sonarqubeConnection' || element.contextValue === 'sonarcloudConnection') {
      const connection = element as Connection;
      const serverType = element.contextValue === 'sonarqubeConnection' ? ServerType.SonarQube : ServerType.SonarCloud;
      return this.getBoundProjects(connection.id, serverType);
    } else if (element.contextValue === 'remoteProject') {
      const project = element as RemoteProject;
      return this.getWorkspaceFoldersBoundTo(project.connectionId, project.key, project.serverType);
    }
    return null;
  }

  async getParent(element: ConnectionsNode): Promise<ConnectionsNode> {
    if (element.contextValue === 'sonarqubeConnection') {
     return this.getInitialState()[0];
    } else if (element.contextValue === 'sonarcloudConnection') {
      return this.getInitialState()[1];
    }
    return null;
  }

  getBoundProjects(connectionId, serverType: ServerType) {
    const allKeys = BindingService.instance.getBoundProjectKeys(connectionId);
    void this.loadMissingProjectNames(connectionId, allKeys);
    return allKeys.map(key => {
      const cacheKey = projectNameCacheKey(connectionId, key);
      return new RemoteProject(connectionId, key, serverType, this.projectNames.get(cacheKey), this.failedProjectNames.has(cacheKey));
    });
  }

  private async loadMissingProjectNames(connectionId, allKeys: string[]) {
    const keys = allKeys.filter(key => {
      const cacheKey = projectNameCacheKey(connectionId, key);
      return !this.projectNames.has(cacheKey) && !this.failedProjectNames.has(cacheKey) && !this.projectNamesBeingLoaded.has(cacheKey);
    });
    if (keys.length === 0) {
      return;
    }
    keys.forEach(key => this.projectNamesBeingLoaded.add(projectNameCacheKey(connectionId, key)));
    try {
      const keysToNames = await this.client.getRemoteProjectNamesByKeys(connectionId || DEFAULT_CONNECTION_ID, keys);
      keys.forEach(key => this.projectNames.set(projectNameCacheKey(connectionId, key), keysToNames[key] ?? null));
    } catch (e) {
      console.log(e);
      keys.forEach(key => this.failedProjectNames.add(projectNameCacheKey(connectionId, key)));
    } finally {
      keys.forEach(key => this.projectNamesBeingLoaded.delete(projectNameCacheKey(connectionId, key)));
    }
    this.refresh();
  }

  getWorkspaceFoldersBoundTo(connectionId, projectKey, serverType: ServerType) {
    return BindingService.instance
      .getBindingsOfProject(connectionId, projectKey)
      .map(binding => this.toBoundItem(binding, connectionId, serverType))
      .filter(item => item !== undefined);
  }

  private toBoundItem(binding: ExtendedServer.BindingInfo, connectionId, serverType: ServerType) {
    if (binding.source === 'SETTINGS') {
      const folder = VSCode.workspace.getWorkspaceFolder(VSCode.Uri.parse(binding.scopeUri));
      return folder ? new WorkspaceFolderItem(folder.name, folder, connectionId, serverType) : undefined;
    }
    return new ConfigScopeItem(binding.scopeUri, binding.projectKey, connectionId, binding.relativePath);
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
    const allConnections = [...this.allConnections.__sonarqube__, ...this.allConnections.__sonarcloud__];
    const connectionToUpdate = allConnections.find(c => c.id === checkResult.connectionId);
    if (connectionToUpdate) {
      connectionToUpdate.status = checkResult.success ? 'ok' : 'notok';
      connectionToUpdate.refresh();
      this.refresh(connectionToUpdate);
    }
  }
}

export enum ServerType {
  SonarQube = 'SonarQube Server',
  SonarCloud = 'SonarQube Cloud'
}
