/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import Timeout = NodeJS.Timeout;
import * as VSCode from 'vscode';
import { ProviderResult, TextDocument, ThemeColor, ThemeIcon } from 'vscode';
import { Diagnostic, PublishHotspotsForFileParams } from '../lsp/protocol';
import { ConnectionSettingsService } from '../settings/connectionsettings';
import { Commands } from '../util/commands';
import { getFileNameFromFullPath, getRelativePathFromFullPath, protocol2CodeConverter } from '../util/uri';
import { OPEN_HOTSPOT_IN_IDE_SOURCE } from './hotspots';
import { logToSonarLintOutput } from '../util/logging';
import { isVerboseEnabled } from '../settings/settings';
import { SINGLE_LOCATION_DECORATION } from '../location/locations';

const SONARLINT_SOURCE = 'sonarlint';
const REMOTE_SOURCE = 'remote';

const REFRESH_DELAY_MS = 500;

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
    public readonly serverIssueKey: string,
    public readonly contextValue: 'newHotspotItem' | 'knownHotspotItem' | 'remoteHotspotItem',
    public readonly vulnerabilityProbability: HotspotReviewPriority,
    public readonly source: string,
    public readonly message: string,
    public readonly ruleKey: string,
    public readonly fileUri: string,
    public readonly status: number
  ) {
    super(message, VSCode.TreeItemCollapsibleState.None);
    this.id = key;
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

type ShowMode = 'Folder' | 'OpenFiles';

export class AllHotspotsTreeDataProvider implements VSCode.TreeDataProvider<HotspotTreeViewItem> {
  private readonly _onDidChangeTreeData = new VSCode.EventEmitter<HotspotTreeViewItem | undefined>();
  readonly onDidChangeTreeData: VSCode.Event<HotspotTreeViewItem | undefined> = this._onDidChangeTreeData.event;
  public fileHotspotsCache = new Map<string, Diagnostic[]>();
  private readonly filesWithHotspots = new Map<string, FileGroup>();
  private showMode: ShowMode;
  private refreshTimeout: Timeout;

  constructor(private readonly connectionSettingsService: ConnectionSettingsService) {
    this.refreshTimeout = null;
    this.updateContextShowMode('OpenFiles');
  }

  async showHotspotsInFolder() {
    await this.updateContextShowMode('Folder');
  }

  async showHotspotsInOpenFiles() {
    await this.updateContextShowMode('OpenFiles');
  }

  private async updateContextShowMode(showMode: ShowMode) {
    this.showMode = showMode;
    await VSCode.commands.executeCommand('setContext', 'SonarLint.Hotspots.ShowMode', showMode);
  }

  async refresh(hotspotsPerFile?: PublishHotspotsForFileParams) {
    if (hotspotsPerFile && hotspotsPerFile.uri) {
      if (hotspotsPerFile.diagnostics.length > 0) {
        this.fileHotspotsCache.set(hotspotsPerFile.uri, hotspotsPerFile.diagnostics);
      } else {
        this.fileHotspotsCache.delete(hotspotsPerFile.uri);
      }
    }
    if (this.refreshTimeout === null) {
      this.refreshTimeout = setTimeout(() => this.triggerRefresh(), REFRESH_DELAY_MS);
    }
  }

  triggerRefresh() {
    this.refreshTimeout = null;
    this.cleanupHotspotsCache()
      .catch(e => {
        logToSonarLintOutput(`Error refreshing hotspots: ${e}`);
      })
      .finally(() => {
        this._onDidChangeTreeData.fire(null);
        this.cleanEditorDecorations();
      });
  }

  cleanEditorDecorations() {
    VSCode.window.visibleTextEditors.forEach(editor => editor.setDecorations(SINGLE_LOCATION_DECORATION, []));
  }

  countAllHotspots(openDocuments = VSCode.workspace.textDocuments) {
    if (this.showMode === 'OpenFiles') {
      return [...this.fileHotspotsCache]
        .map((entry, index) => (this.isFileOpen(openDocuments, entry[0]) ? entry[1].length : 0))
        .reduce((a, b) => a + b, 0);
    }
    return [...this.fileHotspotsCache.values()].map(diags => diags.length).reduce((a, b) => a + b, 0);
  }

  getTreeItem(element: HotspotTreeViewItem): VSCode.TreeItem {
    return element;
  }

  getChildren(element?: HotspotTreeViewItem): HotspotTreeViewItem[] {
    if (!element && !this.isAnyConnectionConfigured()) {
      return [];
    } else if (!element && this.fileHotspotsCache.size > 0) {
      return this.getFiles();
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
    if (element && element.contextValue === 'knownHotspotItem') {
      const relativeFolderUri = getRelativePathFromFullPath(
        element.fileUri,
        VSCode.workspace.getWorkspaceFolder(VSCode.Uri.parse(element.fileUri)),
        false
      );
      const fileUri = relativeFolderUri + getFileNameFromFullPath(element.fileUri);
      return this.filesWithHotspots.get(fileUri);
    }
    return null;
  }

  isAnyConnectionConfigured(): boolean {
    const sonarQubeConnections = this.connectionSettingsService.getSonarQubeConnections();
    const sonarCloudConnections = this.connectionSettingsService.getSonarCloudConnections();
    return sonarCloudConnections.length > 0 || sonarQubeConnections.length > 0;
  }

  getHotspotsForFile(fileUri: string, contextValue: string): HotspotNode[] {
    if (!this.fileHotspotsCache.has(fileUri)) {
      return [];
    }
    return this.fileHotspotsCache
      .get(fileUri)
      .filter(h => {
        if (contextValue === 'newHotspotsGroup') {
          return h.source === SONARLINT_SOURCE;
        } else if (contextValue === 'knownHotspotsGroup') {
          return h.source === REMOTE_SOURCE || h.source === OPEN_HOTSPOT_IN_IDE_SOURCE;
        }
        return false;
      })
      .map(h => {
        const hotspotKey = h.data.entryKey as string;
        const serverIssueKey = h.data.serverIssueKey;
        const status = h.data.status as number;
        return new HotspotNode(
          hotspotKey,
          serverIssueKey,
          this.getHotspotItemContextValue(h, contextValue),
          h.severity,
          h.source,
          h.message,
          h.code as string,
          fileUri,
          status
        );
      })
      .sort((h1, h2) => h1.vulnerabilityProbability - h2.vulnerabilityProbability);
  }

  getFiles(openDocuments = VSCode.workspace.textDocuments) {
    const arr: FileGroup[] = [];
    this.fileHotspotsCache.forEach((_v, fileName) => {
      if (this.showMode === 'OpenFiles') {
        const isFileOpen = this.isFileOpen(openDocuments, fileName);
        if (isFileOpen) {
          this.updateCacheForFile(fileName, arr);
        }
      } else {
        this.updateCacheForFile(fileName, arr);
      }
    });
    return arr;
  }

  private isFileOpen(openDocuments: readonly TextDocument[], fileName: string) {
    const fileUri = protocol2CodeConverter(fileName);
    const fileIndex = openDocuments.findIndex(d => {
      return d.uri.path === fileUri.path;
    });
    return fileIndex > -1;
  }

  private updateCacheForFile(fileName: string, arr: FileGroup[]) {
    const fileGroup = new FileGroup(fileName.toString());
    arr.push(fileGroup);
    this.filesWithHotspots.set(`${fileGroup.description}${fileGroup.label}`, fileGroup);
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
            return diag.source === SONARLINT_SOURCE || diag.source === REMOTE_SOURCE;
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
    return children;
  }

  fileHasNewHotspots(fileUri: string): boolean {
    return (
      this.fileHotspotsCache.has(fileUri) &&
      this.fileHotspotsCache.get(fileUri).length > 0 &&
      this.fileHotspotsCache.get(fileUri).some(diag => diag.source === SONARLINT_SOURCE)
    );
  }

  fileHasTrackedHotspots(fileUri: string): boolean {
    return (
      this.fileHotspotsCache.get(fileUri).length > 0 &&
      this.fileHotspotsCache.get(fileUri).some(diag => diag.source === REMOTE_SOURCE)
    );
  }

  openHotspotInIdeForFileWasTriggered(fileUri: string): boolean {
    return (
      this.fileHotspotsCache.get(fileUri).length > 0 &&
      this.fileHotspotsCache.get(fileUri).some(diag => diag.source === OPEN_HOTSPOT_IN_IDE_SOURCE)
    );
  }

  private async cleanupHotspotsCache() {
    for (const fullFileUri of this.fileHotspotsCache.keys()) {
      const vscodeUri = VSCode.Uri.parse(fullFileUri);
      const fileName = getFileNameFromFullPath(fullFileUri);
      const relativeFilePath = getRelativePathFromFullPath(
        fullFileUri,
        VSCode.workspace.getWorkspaceFolder(vscodeUri),
        false
      );
      const fullPathInfolder = `${relativeFilePath}${fileName}`;
      const foundFileUris = await VSCode.workspace.findFiles(fullPathInfolder);
      if (!foundFileUris.some(file => file.path === vscodeUri.path)) {
        if (isVerboseEnabled()) {
          logToSonarLintOutput(`Removing unknown file ${fullPathInfolder} from hotspot cache`);
        }
        this.fileHotspotsCache.delete(fullFileUri);
        this.filesWithHotspots.delete(fullPathInfolder);
      }
    }
  }
}
