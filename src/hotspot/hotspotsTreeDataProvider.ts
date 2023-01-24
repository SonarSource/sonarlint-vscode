import * as VSCode from 'vscode';
import { ProviderResult, ThemeColor, ThemeIcon } from 'vscode';
import { Diagnostic, PublishHotspotsForFileParams } from '../lsp/protocol';
import { ConnectionSettingsService } from '../settings/connectionsettings';
import { Commands } from '../util/commands';
import { getFileNameFromFullPath, getRelativePathFromFullPath } from '../util/uri';
import { OPEN_HOTSPOT_IN_IDE_SOURCE } from './hotspots';

const SONARLINT_SOURCE = 'sonarlint';
const SONARQUBE_SOURCE = 'sonarqube';
const SONARCLOUD_SOURCE = 'sonarcloud';

export enum HotspotReviewPriority {
  High = 1,
  Medium = 2,
  Low = 3
}

export class HotspotGroup extends VSCode.TreeItem {
  constructor(public readonly keyword: 'new' | 'known', public readonly fileUri) {
    super(keyword === 'new' ? 'Newly detected' : 'Already known', VSCode.TreeItemCollapsibleState.Expanded);
    this.contextValue = keyword === 'new' ? 'newHotspotsGroup' : 'knownHotspotsGroup';
    this.id = `${keyword}-${fileUri}`;
    this.fileUri = fileUri;
    this.iconPath = new ThemeIcon(
      'security-hotspot',
      new ThemeColor(keyword === 'new' ? 'problemsWarningIcon.foreground' : 'problemsInfoIcon.foreground')
    );
  }
}

export class FileGroup extends VSCode.TreeItem {
  public fileUri: string;
  constructor(public readonly id: string) {
    super(getFileNameFromFullPath(id), VSCode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'hotspotsFileGroup';
    this.fileUri = id;
    const specifyWorkspaceFolderName = VSCode.workspace.workspaceFolders.length > 1;
    this.resourceUri = VSCode.Uri.parse(this.fileUri);
    this.description = getRelativePathFromFullPath(
      id,
      VSCode.workspace.getWorkspaceFolder(this.resourceUri),
      specifyWorkspaceFolderName
    );
    this.iconPath = VSCode.ThemeIcon.File;
  }
}

const vulnerabilityProbabilityToIcon = new Map([
  [HotspotReviewPriority.High, new VSCode.ThemeIcon('error', new VSCode.ThemeColor('problemsErrorIcon.foreground'))],
  [
    HotspotReviewPriority.Medium,
    new VSCode.ThemeIcon('warning', new VSCode.ThemeColor('problemsWarningIcon.foreground'))
  ],
  [HotspotReviewPriority.Low, new VSCode.ThemeIcon('info', new VSCode.ThemeColor('problemsInfoIcon.foreground'))]
]);

export class HotspotNode extends VSCode.TreeItem {
  constructor(
    public readonly key: string,
    public readonly contextValue: 'newHotspotItem' | 'knownHotspotItem' | 'remoteHotspotItem',
    public readonly vulnerabilityProbability: HotspotReviewPriority,
    public readonly source: string,
    public readonly message: string,
    public readonly ruleKey: string,
    public readonly fileUri: string
  ) {
    super(message, VSCode.TreeItemCollapsibleState.None);
    this.iconPath = vulnerabilityProbabilityToIcon.get(vulnerabilityProbability);
    if (source === OPEN_HOTSPOT_IN_IDE_SOURCE) {
      this.command = {
        command: Commands.HIGHLIGHT_REMOTE_HOTSPOT_LOCATION,
        title: 'Show Hotspot Location',
        arguments: [this]
      };
    } else {
      this.command = { command: Commands.SHOW_HOTSPOT_LOCATION, title: 'Show All Locations', arguments: [this] };
    }
    this.description = `${SONARLINT_SOURCE}(${ruleKey})`;
  }
}

export type HotspotTreeViewItem = HotspotNode | HotspotGroup | FileGroup;

export class AllHotspotsTreeDataProvider implements VSCode.TreeDataProvider<HotspotTreeViewItem> {
  private readonly _onDidChangeTreeData = new VSCode.EventEmitter<HotspotTreeViewItem | undefined>();
  readonly onDidChangeTreeData: VSCode.Event<HotspotTreeViewItem | undefined> = this._onDidChangeTreeData.event;
  public fileHotspotsCache = new Map<string, Diagnostic[]>();
  private readonly filesWithHotspots = new Map<string, FileGroup>();

  constructor(private readonly connectionSettingsService: ConnectionSettingsService) {
    // NOP
  }

  refresh(hotspotsPerFile?: PublishHotspotsForFileParams) {
    if (hotspotsPerFile && hotspotsPerFile.uri && hotspotsPerFile.diagnostics.length > 0) {
      this.fileHotspotsCache.set(hotspotsPerFile.uri, hotspotsPerFile.diagnostics);
    }
    this._onDidChangeTreeData.fire(null);
  }

  countAllHotspots() {
    return [...this.fileHotspotsCache.values()].map(diags => diags.length).reduce((a, b) => a + b, 0);
  }

  getTreeItem(element: HotspotTreeViewItem): VSCode.TreeItem {
    return element;
  }

  getChildren(element?: HotspotTreeViewItem): HotspotTreeViewItem[] {
    const arr = [];
    if (!element && !this.isAnyConnectionConfigured()) {
      return [];
    } else if (!element && this.fileHotspotsCache.size > 0) {
      this.fileHotspotsCache.forEach((_v, fileName) => {
        const fileGroup = new FileGroup(fileName.toString());
        arr.push(fileGroup);
        this.filesWithHotspots.set(`${fileGroup.description}${fileGroup.label}`, fileGroup);
      });
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

  getParent(element: HotspotTreeViewItem): ProviderResult<HotspotTreeViewItem> {
    return null;
  }

  isAnyConnectionConfigured(): boolean {
    const sonarQubeConnections = this.connectionSettingsService.getSonarQubeConnections();
    const sonarCloudConnections = this.connectionSettingsService.getSonarCloudConnections();
    return sonarCloudConnections.length > 0 || sonarQubeConnections.length > 0;
  }

  getHotspotsForFile(fileUri: string, contextValue: string): HotspotNode[] {
    return this.fileHotspotsCache
      .get(fileUri)
      .filter(h => {
        if (contextValue === 'newHotspotsGroup') {
          return h.source === SONARLINT_SOURCE;
        } else if (contextValue === 'knownHotspotsGroup') {
          return (
            h.source === SONARQUBE_SOURCE || h.source === SONARCLOUD_SOURCE || h.source === OPEN_HOTSPOT_IN_IDE_SOURCE
          );
        }
        return false;
      })
      .map(h => {
        const hotspotKey = h.data as string;
        return new HotspotNode(
          hotspotKey,
          this.getHotspotItemContextValue(h, contextValue),
          h.severity,
          h.source,
          h.message,
          h.code as string,
          fileUri
        );
      })
      .sort((h1, h2) => h1.vulnerabilityProbability - h2.vulnerabilityProbability);
  }

  getHotspotItemContextValue(hotspot, hotspotGroupContextValue) {
    if (hotspot.source === 'openInIde') {
      return 'remoteHotspotItem';
    }
    return hotspotGroupContextValue === 'knownHotspotsGroup' ? 'knownHotspotItem' : 'newHotspotItem';
  }

  getAllFilesWithHotspots(): Map<string, FileGroup> {
    return this.filesWithHotspots;
  }

  hasLocalHotspots(): boolean {
    return (
      this.fileHotspotsCache.size > 0 &&
      [...this.fileHotspotsCache.values()] // at least one of the hotspots in cache is in the view already
        .map(diags =>
          diags.some(diag => {
            return (
              diag.source === SONARLINT_SOURCE || diag.source === SONARQUBE_SOURCE || diag.source === SONARCLOUD_SOURCE
            );
          })
        )
        .some(v => {
          return v;
        })
    );
  }

  getHotspotsGroupsForFile(fileUri: string): HotspotGroup[] {
    const children = [];
    if (this.fileHasNewHotspots(fileUri)) {
      children.push(new HotspotGroup('new', fileUri));
    }
    if (this.fileHasTrackedHotspots(fileUri) || this.openHotspotInIdeForFileWasTriggered(fileUri)) {
      children.push(new HotspotGroup('known', fileUri));
    }
    console.log("i'm here getting children for file");
    console.log(children);
    return children;
  }

  fileHasNewHotspots(fileUri: string): boolean {
    return (
      this.fileHotspotsCache.get(fileUri).length > 0 &&
      this.fileHotspotsCache.get(fileUri).some(diag => diag.source === SONARLINT_SOURCE)
    );
  }

  fileHasTrackedHotspots(fileUri: string): boolean {
    return (
      this.fileHotspotsCache.get(fileUri).length > 0 &&
      this.fileHotspotsCache
        .get(fileUri)
        .some(diag => diag.source === SONARQUBE_SOURCE || diag.source === SONARCLOUD_SOURCE)
    );
  }

  openHotspotInIdeForFileWasTriggered(fileUri: string): boolean {
    return (
      this.fileHotspotsCache.get(fileUri).length > 0 &&
      this.fileHotspotsCache.get(fileUri).some(diag => diag.source === OPEN_HOTSPOT_IN_IDE_SOURCE)
    );
  }

  getAllHotspots(): Diagnostic[] {
    return [...this.fileHotspotsCache.values()].reduce(h => h);
  }
}
