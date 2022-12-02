import * as VSCode from 'vscode';
import { SonarLintExtendedLanguageClient } from '../lsp/client';
import { Diagnostic, Flow, HotspotProbability, PublishHotspotsForFileParams } from '../lsp/protocol';
import { ConnectionSettingsService } from '../settings/connectionsettings';
import { Commands } from '../util/commands';
import { getFileNameFromFullPath, getRelativePathFromFullPath } from '../util/uri';
import { resolveExtensionFile } from '../util/util';
import { ThemeColor, ThemeIcon } from 'vscode';

enum HotspotReviewPriority {
  High = 1,
  Medium = 2,
  Low = 3
}

interface HotspotData {
  hotspotKey: string;
  hasFlows: boolean;
}

class HotspotGroup extends VSCode.TreeItem {
  constructor(public readonly keyword: 'new' | 'known', public readonly fileUri) {
    super(keyword === 'new' ? 'Newly detected' : 'Already known', VSCode.TreeItemCollapsibleState.Expanded);
    this.contextValue = keyword === 'new' ? 'newHotspotsGroup' : 'knownHotspotsGroup';
    this.id = `${keyword}-${fileUri}`;
    this.fileUri = fileUri;
    this.iconPath = new ThemeIcon('security-hotspot',
      new ThemeColor(keyword === 'new' ? 'problemsWarningIcon.foreground' : 'problemsInfoIcon.foreground'));
  }
}

class FileGroup extends VSCode.TreeItem {
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
  [
    HotspotReviewPriority.High,
    new VSCode.ThemeIcon('error', new VSCode.ThemeColor('problemsErrorIcon.foreground'))
  ],
  [
    HotspotReviewPriority.Medium,
    new VSCode.ThemeIcon('warning', new VSCode.ThemeColor('problemsWarningIcon.foreground'))
  ],
  [
    HotspotReviewPriority.Low,
    new VSCode.ThemeIcon('info', new VSCode.ThemeColor('problemsInfoIcon.foreground'))
  ]
]);

export class HotspotNode extends VSCode.TreeItem {
  constructor(
    public readonly key: string,
    public readonly contextValue: 'newHotspotItem' | 'knownHotspotItem',
    public readonly vulnerabilityProbability: HotspotReviewPriority,
    public readonly source: string,
    public readonly message: string,
    public readonly ruleKey: string,
    public readonly hasFlows: boolean,
    public readonly fileUri: string,
  ) {
    super(message, VSCode.TreeItemCollapsibleState.None);
    this.iconPath = vulnerabilityProbabilityToIcon.get(vulnerabilityProbability);
    this.command = { command: Commands.SHOW_HOTSPOT_LOCATION, title: 'Show All Locations', arguments: [this] };
    this.description = `sonarlint(${ruleKey})`;
  }
}

export type HotspotTreeViewItem = HotspotNode | HotspotGroup | FileGroup;

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

  countAllHotspots() {
    return [... this.fileHotspotsCache.values()]
      .map(diags => diags.length)
      .reduce((a, b) => a + b, 0);
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
    // TODO check only if there is SQ connection and it is >v9.7
    return !(!sonarCloudConnections && !sonarQubeConnections);
  }

  getHotspotsForFile(fileUri: string, contextValue: string) {
    return this.fileHotspotsCache
      .get(fileUri)
      .filter(h => {
        if (contextValue === 'newHotspotsGroup') {
          return h.source === 'sonarlint';
        } else if (contextValue === 'knownHotspotsGroup') {
          return h.source === 'sonarqube' || h.source === 'sonarcloud';
        }
        return false;
      })
      .map(
        h => {
          const { hotspotKey, hasFlows } = h.data as HotspotData;
          return new HotspotNode(
            hotspotKey,
            contextValue === 'knownHotspotsGroup' ? 'knownHotspotItem' : 'newHotspotItem',
            h.severity,
            h.source,
            h.message,
            h.code as string,
            hasFlows,
            fileUri
          );
        }
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
