import * as VSCode from 'vscode';
import { ConnectionCheckResult } from './protocol';
import { BaseConnection, ConnectionSettingsService } from './settings';

type ConnectionStatus = 'ok' | 'notok' | 'loading';

const DEFAULT_CONNECTION_ID = '<default>';

export class Connection extends VSCode.TreeItem {
    constructor(
        public readonly id: string,
        public readonly label: string,
        public readonly contextValue: 'sonarqubeConnection' | 'sonarcloudConnection',
        public status: ConnectionStatus
    ) {
        super(label, VSCode.TreeItemCollapsibleState.None);
    }
    collapsibleState = VSCode.TreeItemCollapsibleState.None;

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

export class ConnectionGroup extends VSCode.TreeItem {
    constructor(
        public readonly id: 'sonarqube' | 'sonarcloud',
        public readonly label: 'SonarQube' | 'SonarCloud',
        public readonly contextValue: 'sonarQubeGroup' | 'sonarCloudGroup'
    ) {
        super(label, VSCode.TreeItemCollapsibleState.Expanded);
    }
}

export type ConnectionsNode = Connection | ConnectionGroup;

export class AllConnectionsTreeDataProvider implements VSCode.TreeDataProvider<ConnectionsNode> {

    private readonly _onDidChangeTreeData = new VSCode.EventEmitter<Connection | undefined>();
    readonly onDidChangeTreeData: VSCode.Event<ConnectionsNode | undefined> = this._onDidChangeTreeData.event;
    private allConnections = {sonarqube: Array.from<Connection>([]), sonarcloud: Array.from<Connection>([])};

    constructor(
      private readonly connectionChecker?: (connectionId) => Thenable<ConnectionCheckResult>
    ) { }

    async getConnections(type: string): Promise<Connection[]> {
        const contextValue = type === 'sonarqube' ? 'sonarqubeConnection' : 'sonarcloudConnection';
        const labelKey = 'connectionId';
        const alternativeLabelKey = type === 'sonarqube' ? 'serverUrl' : 'organizationKey';

        const connectionsFromSettings: BaseConnection[] = (type === 'sonarqube' ?
            ConnectionSettingsService.instance.getSonarQubeConnections() :
            ConnectionSettingsService.instance.getSonarCloudConnections());
        const connections = await Promise.all(connectionsFromSettings.map(async (c) => {
            const label = c[labelKey] ? c[labelKey] : c[alternativeLabelKey];
            let status : ConnectionStatus = 'loading';
            const connectionId : string = c.connectionId ? c.connectionId : DEFAULT_CONNECTION_ID;
            try {
                const connectionCheckResult = await this.checkConnection(connectionId);
                if (connectionCheckResult.success) {
                    status = 'ok';
                } else if (!/unknown/.test(connectionCheckResult.reason)) {
                    status = 'notok';
                }
            } catch (e){
                console.log(e);
            }
            return new Connection(c.connectionId, label, contextValue, status);
        }));

        this.allConnections[type] = connections;
        return connections;
    }

    async checkConnection(connectionId) {
        return this.connectionChecker ?
          this.connectionChecker(connectionId) :
          { success: false, reason: 'Connection checker not available yet' };
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
            return this.getConnections('sonarqube');
        } else if (element.contextValue === 'sonarCloudGroup') {
            return this.getConnections('sonarcloud');
        }
        return null;
    }

    getInitialState(): ConnectionGroup[] {
        const sqConnections = ConnectionSettingsService.instance.getSonarQubeConnections();
        const scConnections = ConnectionSettingsService.instance.getSonarCloudConnections();
        return [
            sqConnections.length > 0 ? new ConnectionGroup('sonarqube', 'SonarQube', 'sonarQubeGroup') : null,
            scConnections.length > 0 ? new ConnectionGroup('sonarcloud', 'SonarCloud', 'sonarCloudGroup') : null
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
