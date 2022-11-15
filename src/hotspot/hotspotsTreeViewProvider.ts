import * as VSCode from 'vscode';
import { SonarLintExtendedLanguageClient } from '../lsp/client';
import { ConnectionSettingsService } from '../settings/connectionsettings';
import { Flow, Diagnostic, PublishHotspotsForFileParams } from '../lsp/protocol';
import { getFileNameFromFullPath, getRelativePathFromFullPath } from '../util/uri';
import { Commands } from '../util/commands';
import { resolveExtensionFile } from '../util/util';

class HotspotGroup extends VSCode.TreeItem {
  constructor(public readonly keyword: 'new' | 'known', public readonly fileUri) {
    super(keyword === 'new' ? 'NEW' : 'KNOWN BY SERVER', VSCode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = keyword === 'new' ? 'newHotspotsGroup' : 'knownHotspotsGroup';
    this.id = `${keyword}-${fileUri}`;
    this.fileUri = fileUri;
  }
}

class FileGroup extends VSCode.TreeItem {
  public fileUri: string;
  constructor(public readonly id: string) {
    super(getFileNameFromFullPath(id), VSCode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = 'hotspotsFileGroup';
    this.fileUri = id;
    const specifyWorkspaceFolderName = VSCode.workspace.workspaceFolders.length > 1;
    this.description = getRelativePathFromFullPath(
      id,
      VSCode.workspace.getWorkspaceFolder(VSCode.Uri.parse(this.fileUri)),
      specifyWorkspaceFolderName
    );
    this.iconPath = resolveExtensionFile('images', 'hotspot.png');
  }
}

export class HotspotNode extends VSCode.TreeItem {
  constructor(
    public readonly key: string,
    public readonly contextValue: 'newHotspotItem' | 'knownHotspotItem',
    public readonly vulnerabilityProbability: number,
    public readonly source: string,
    public readonly message: string,
    public readonly ruleKey: string,
    public readonly flows: Flow[],
    public readonly fileUri: string,
    public readonly creationDate?: string
  ) {
    super(message, VSCode.TreeItemCollapsibleState.None);
    if (vulnerabilityProbability === 1) {
      this.iconPath = new VSCode.ThemeIcon('error', new VSCode.ThemeColor('testing.iconFailed'));
    } else if (vulnerabilityProbability === 2) {
      this.iconPath = new VSCode.ThemeIcon('warning', new VSCode.ThemeColor('debugConsole.warningForeground'));
    } else if (vulnerabilityProbability === 3) {
      this.iconPath = new VSCode.ThemeIcon('info', new VSCode.ThemeColor('debugIcon.pauseForeground'));
    }
    this.command = { command: Commands.SHOW_HOTSPOT_LOCATION, title: 'Show All Locations', arguments: [this] };
    this.description = `sonarlint(${ruleKey})`;
  }
}

type HotspotTreeViewItem = HotspotNode | HotspotGroup | FileGroup;

export class AllHotspotsTreeDataProvider implements VSCode.TreeDataProvider<HotspotTreeViewItem> {
  private readonly _onDidChangeTreeData = new VSCode.EventEmitter<HotspotTreeViewItem | undefined>();
  readonly onDidChangeTreeData: VSCode.Event<HotspotTreeViewItem | undefined> = this._onDidChangeTreeData.event;
  private readonly fileHotspotsCache = new Map<string, Diagnostic[]>();

  constructor(
    private readonly client: SonarLintExtendedLanguageClient,
    private readonly connectionSettingsService: ConnectionSettingsService
  ) {
    // NOP
  }

  refresh(hotspotsPerFile?: PublishHotspotsForFileParams) {
    if (hotspotsPerFile && hotspotsPerFile.uri && hotspotsPerFile.diagnostics.length > 0) {
      this.fileHotspotsCache.set(hotspotsPerFile.uri, hotspotsPerFile.diagnostics);
      this._onDidChangeTreeData.fire(null);
    }
  }

  getTreeItem(element: HotspotTreeViewItem): VSCode.TreeItem {
    return element;
  }

  getChildren(element?: HotspotTreeViewItem): HotspotTreeViewItem[] {
    const arr = [];
    if (!element && !this.isAnyConnectionConfigured()) {
      return [];
    } else if (!element && this.fileHotspotsCache.size > 0) {
      this.fileHotspotsCache.forEach((_v, fileName) => arr.push(new FileGroup(fileName.toString())));
      return arr;
    } else if (element && element.contextValue === 'hotspotsFileGroup') {
      return this.getHotspotsGroupsForFile(element.fileUri);
    } else if (
      element &&
      (element.contextValue === 'newHotspotsGroup' || element.contextValue === 'knownHotspotsGroup')
    ) {
      return this.getHotspotsForFile(element.fileUri, element.contextValue);
    }

    return null;
  }

  isAnyConnectionConfigured(): boolean {
    const sonarQubeConnections = this.connectionSettingsService.getSonarQubeConnections();
    const sonarCloudConnections = this.connectionSettingsService.getSonarCloudConnections();
    return !(!sonarCloudConnections && !sonarQubeConnections); // TODO check only if there is SQ connection and it is >v9.7
  }

  getHotspotsForFile(fileUri: string, contextValue: string) {
    return this.fileHotspotsCache
      .get(fileUri)
      .filter(h => {
        if (contextValue === 'newHotspotsGroup') {
          return h.source === 'sonarlint';
        } else if (contextValue === 'knownHotspotsGroup') {
          return h.source === 'sonarqube';
        }
        return false;
      })
      .map(
        h =>
          new HotspotNode(
            h.data,
            contextValue === 'knownHotspotsGroup' ? 'knownHotspotItem' : 'newHotspotItem',
            h.severity,
            h.source,
            h.message,
            h.code,
            // h.flows,
            [],
            fileUri,
            h.creationDate
          )
      )
      .sort((h1, h2) => h1.vulnerabilityProbability - h2.vulnerabilityProbability);
  }

  getHotspotsGroupsForFile(fileUri: string) {
    const children = [];
    if (this.fileHasNewHotspots(fileUri)) {
      children.push(new HotspotGroup('new', fileUri));
    }
    if (this.fileHasTrackedHotspots(fileUri)) {
      children.push(new HotspotGroup('known', fileUri));
    }
    return children;
  }

  private fileHasNewHotspots(fileUri: string) {
    return (
      this.fileHotspotsCache.get(fileUri).length > 0 &&
      this.fileHotspotsCache.get(fileUri).some(diag => diag.source === 'sonarlint')
    );
  }

  private fileHasTrackedHotspots(fileUri: string) {
    return (
      this.fileHotspotsCache.get(fileUri).length > 0 &&
      this.fileHotspotsCache.get(fileUri).some(diag => diag.source === 'sonarqube' || diag.source === 'sonarcloud')
    );
  }
}
