import * as VSCode from 'vscode';
import * as path from 'path';
import { ConnectionCheckResult } from './protocol';

type ConnectionStatus = 'ok' | 'notok' | 'loading';
const CONNECTED_MODE_SETTINGS = 'sonarlint.connectedMode.connections';

function getPathToIcon(iconFileName: string) {
    return path.join(__filename, '../..', 'images', 'connection', iconFileName);
}

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
            return getPathToIcon('ok.svg');
        } else if (this.status === 'notok') {
            return getPathToIcon('notok.svg');
        }
        return getPathToIcon('loading.svg');
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
        super(label, VSCode.TreeItemCollapsibleState.Collapsed);
    }
}

export type ConnectionsNode = Connection | ConnectionGroup;

export class AllConnectionsTreeDataProvider implements VSCode.TreeDataProvider<ConnectionsNode> {

    private readonly _onDidChangeTreeData = new VSCode.EventEmitter<Connection | undefined>();
    readonly onDidChangeTreeData: VSCode.Event<ConnectionsNode | undefined> = this._onDidChangeTreeData.event;
    private allConnections = {sonarqube: [], sonarcloud: []};

    constructor(private readonly connectionChecker?: (connectionId) => Thenable<ConnectionCheckResult>) { }

    getConnections(type: string): Connection[] {
        const contextValue = type === 'sonarqube' ? 'sonarqubeConnection' : 'sonarcloudConnection';
        const labelKey = type === 'sonarqube' ? 'connectionId' : 'organizationKey';
        const alternativeLabelKey = type === 'sonarqube' ? 'serverUrl' : 'organizationKey';

        let connections = VSCode.workspace.getConfiguration(CONNECTED_MODE_SETTINGS)[type];
        connections = connections.map(async (c) => {
            const label = c[labelKey] ? c[labelKey] : c[alternativeLabelKey];
            let status : ConnectionStatus = 'loading';
            try {
                const connectionCheckResult =
                    this.connectionChecker ? (await this.connectionChecker(c.connectionId)) : {success: false};
                status = connectionCheckResult && connectionCheckResult.success ? 'ok' : 'notok';
            } catch (e){
                console.log(e);
            }
            return new Connection(c['connectionId'], label, contextValue, status);
        });

        this.allConnections[type] = connections;
        return connections;
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

    getChildren(element?: ConnectionsNode): ConnectionsNode[] {
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
        const sqConnections = VSCode.workspace.getConfiguration(CONNECTED_MODE_SETTINGS)['sonarqube'];
        const scConnections = VSCode.workspace.getConfiguration(CONNECTED_MODE_SETTINGS)['sonarcloud'];
        return [
            sqConnections.length > 0 ? new ConnectionGroup('sonarqube', 'SonarQube', 'sonarQubeGroup') : null,
            scConnections.length > 0 ? new ConnectionGroup('sonarcloud', 'SonarCloud', 'sonarCloudGroup') : null
        ];
    }
}
