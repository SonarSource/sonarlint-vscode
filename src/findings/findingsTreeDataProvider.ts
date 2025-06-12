/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as VSCode from 'vscode';
import { ProviderResult, ThemeColor, ThemeIcon } from 'vscode';
import { Diagnostic, PublishDiagnosticsParams } from '../lsp/protocol';
import { ConnectionSettingsService } from '../settings/connectionsettings';
import { Commands } from '../util/commands';
import { getFileNameFromFullPath, getRelativePathFromFullPath, protocol2CodeConverter } from '../util/uri';
import { logToSonarLintOutput } from '../util/logging';
import { isVerboseEnabled } from '../settings/settings';
import { HotspotReviewPriority } from '../hotspot/hotspotsTreeDataProvider';

const FINDINGS_REFRESH_DELAY_MS = 500;

export enum FindingType {
  SecurityHotspot = 'hotspot',
  TaintVulnerability = 'taint'
}

export class FindingsCategoryNode extends VSCode.TreeItem {
  constructor(
    public readonly type: FindingType,
    public readonly count: number,
    public readonly fileUri: string
  ) {
    const label = type === FindingType.SecurityHotspot ? 'Security Hotspots' : 'Taint Vulnerabilities';
    super(`${label} (${count})`, VSCode.TreeItemCollapsibleState.Expanded);
    
    this.contextValue = `${type}Category`;
    this.id = `category-${type}-${fileUri}`;
    
    const iconName = type === FindingType.SecurityHotspot ? 'security-hotspot' : 'shield';
    const iconColor = type === FindingType.SecurityHotspot ? 'problemsWarningIcon.foreground' : 'problemsErrorIcon.foreground';
    this.iconPath = new ThemeIcon(iconName, new ThemeColor(iconColor));
  }
}

export class FindingsFileNode extends VSCode.TreeItem {
  constructor(
    public readonly fileUri: string,
    public readonly hotspotsCount: number,
    public readonly taintCount: number
  ) {
    super(getFileNameFromFullPath(fileUri), VSCode.TreeItemCollapsibleState.Expanded);
    
    this.contextValue = 'findingsFile';
    this.id = `file-${fileUri}`;
    this.resourceUri = VSCode.Uri.parse(fileUri);
    
    const specifyWorkspaceFolderName = VSCode.workspace.workspaceFolders?.length > 1;
    this.description = getRelativePathFromFullPath(
      fileUri,
      VSCode.workspace.getWorkspaceFolder(this.resourceUri),
      specifyWorkspaceFolderName
    );
    
    this.iconPath = VSCode.ThemeIcon.File;
    
    const totalCount = hotspotsCount + taintCount;
    const parts = [];
    if (hotspotsCount > 0) parts.push(`${hotspotsCount} hotspot(s)`);
    if (taintCount > 0) parts.push(`${taintCount} taint vulnerability/ies`);
    this.tooltip = `${totalCount} finding(s): ${parts.join(', ')}`;
  }
}

const severityToIcon = new Map([
  [HotspotReviewPriority.High, new VSCode.ThemeIcon('error', new VSCode.ThemeColor('problemsErrorIcon.foreground'))],
  [HotspotReviewPriority.Medium, new VSCode.ThemeIcon('warning', new VSCode.ThemeColor('problemsWarningIcon.foreground'))],
  [HotspotReviewPriority.Low, new VSCode.ThemeIcon('info', new VSCode.ThemeColor('problemsInfoIcon.foreground'))]
]);

export class FindingNode extends VSCode.TreeItem {
  constructor(
    public readonly key: string,
    public readonly serverIssueKey: string,
    public readonly type: FindingType,
    public readonly severity: HotspotReviewPriority,
    public readonly message: string,
    public readonly ruleKey: string,
    public readonly fileUri: string,
    public readonly status?: number
  ) {
    super(message, VSCode.TreeItemCollapsibleState.None);
    
    this.id = `${type}-${key}`;
    this.contextValue = `${type}Item`;
    this.iconPath = severityToIcon.get(severity);
    this.description = `sonarqube(${ruleKey})`;
    
    // Set up the command to show the finding location
    if (type === FindingType.SecurityHotspot) {
      this.command = {
        command: Commands.SHOW_HOTSPOT_LOCATION,
        title: 'Show Hotspot Location',
        arguments: [{ key, fileUri }]
      };
    } else {
      this.command = {
        command: Commands.SHOW_ALL_LOCATIONS,
        title: 'Show Taint Vulnerability Location',
        arguments: [{ key, fileUri }]
      };
    }
  }
}

export type FindingsTreeViewItem = FindingsCategoryNode | FindingsFileNode | FindingNode;

export class FindingsTreeDataProvider implements VSCode.TreeDataProvider<FindingsTreeViewItem> {
  private static _instance: FindingsTreeDataProvider;
  private readonly _onDidChangeTreeData = new VSCode.EventEmitter<FindingsTreeViewItem | undefined>();
  readonly onDidChangeTreeData: VSCode.Event<FindingsTreeViewItem | undefined> = this._onDidChangeTreeData.event;
  
  private hotspotsCache = new Map<string, Diagnostic[]>();
  private taintVulnerabilitiesCache = new Map<string, VSCode.Diagnostic[]>();
  private refreshTimeout: NodeJS.Timeout;

  constructor(private readonly connectionSettingsService: ConnectionSettingsService) {
    this.refreshTimeout = null;
  }

  static init(connectionSettingsService: ConnectionSettingsService) {
    this._instance = new FindingsTreeDataProvider(connectionSettingsService);
  }

  static get instance(): FindingsTreeDataProvider {
    return FindingsTreeDataProvider._instance;
  }

  refresh() {
    if (this.refreshTimeout === null) {
      this.refreshTimeout = setTimeout(() => this.triggerRefresh(), FINDINGS_REFRESH_DELAY_MS);
    }
  }

  private triggerRefresh() {
    this.refreshTimeout = null;
    this._onDidChangeTreeData.fire(null);
  }

  updateHotspots(hotspotsPerFile: PublishDiagnosticsParams) {
    if (hotspotsPerFile.diagnostics.length > 0) {
      this.hotspotsCache.set(hotspotsPerFile.uri, hotspotsPerFile.diagnostics);
    } else {
      this.hotspotsCache.delete(hotspotsPerFile.uri);
    }
    this.refresh();
  }

  updateTaintVulnerabilities(fileUri: string, diagnostics: VSCode.Diagnostic[]) {
    if (diagnostics.length > 0) {
      this.taintVulnerabilitiesCache.set(fileUri, diagnostics);
    } else {
      this.taintVulnerabilitiesCache.delete(fileUri);
    }
    this.refresh();
  }

  getTreeItem(element: FindingsTreeViewItem): VSCode.TreeItem {
    return element;
  }

  getChildren(element?: FindingsTreeViewItem): ProviderResult<FindingsTreeViewItem[]> {
    if (!element) {
      return this.getRootFiles();
    }

    if (element instanceof FindingsFileNode) {
      return this.getCategoriesForFile(element.fileUri);
    }

    if (element instanceof FindingsCategoryNode) {
      return this.getFindingsForFileAndType(element.fileUri, element.type);
    }

    return [];
  }

  private getRootFiles(): FindingsFileNode[] {
    const allFiles = new Set<string>();
    
    // Collect all file URIs from both caches
    this.hotspotsCache.forEach((_, fileUri) => allFiles.add(fileUri));
    this.taintVulnerabilitiesCache.forEach((_, fileUri) => allFiles.add(fileUri));
    
    const files: FindingsFileNode[] = [];
    allFiles.forEach(fileUri => {
      const hotspotsCount = this.hotspotsCache.get(fileUri)?.length || 0;
      const taintCount = this.taintVulnerabilitiesCache.get(fileUri)?.length || 0;
      
      if (hotspotsCount > 0 || taintCount > 0) {
        files.push(new FindingsFileNode(fileUri, hotspotsCount, taintCount));
      }
    });
    
    return files.sort((a, b) => a.label.toString().localeCompare(b.label.toString()));
  }

  private getCategoriesForFile(fileUri: string): FindingsCategoryNode[] {
    const categories: FindingsCategoryNode[] = [];
    
    const hotspotsCount = this.hotspotsCache.get(fileUri)?.length || 0;
    if (hotspotsCount > 0) {
      categories.push(new FindingsCategoryNode(FindingType.SecurityHotspot, hotspotsCount, fileUri));
    }
    
    const taintCount = this.taintVulnerabilitiesCache.get(fileUri)?.length || 0;
    if (taintCount > 0) {
      categories.push(new FindingsCategoryNode(FindingType.TaintVulnerability, taintCount, fileUri));
    }
    
    return categories;
  }

  private getFindingsForFileAndType(fileUri: string, type: FindingType): FindingNode[] {
    const cache = type === FindingType.SecurityHotspot ? this.hotspotsCache : this.taintVulnerabilitiesCache;
    const diagnostics = cache.get(fileUri) || [];
    
    return diagnostics.map(diagnostic => {
      const key = type === FindingType.SecurityHotspot 
        ? (diagnostic as any).data?.entryKey || diagnostic.code
        : diagnostic.code;
      const serverIssueKey = type === FindingType.SecurityHotspot 
        ? (diagnostic as any).data?.serverIssueKey 
        : null;
      const status = type === FindingType.SecurityHotspot 
        ? (diagnostic as any).data?.status 
        : undefined;
      
      return new FindingNode(
        key?.toString() || 'unknown',
        serverIssueKey?.toString() || '',
        type,
        this.mapSeverityToHotspotPriority(diagnostic.severity),
        diagnostic.message,
        diagnostic.code?.toString() || 'unknown',
        fileUri,
        status
      );
    }).sort((a, b) => a.severity - b.severity);
  }

  private mapSeverityToHotspotPriority(severity: VSCode.DiagnosticSeverity | number): HotspotReviewPriority {
    if (typeof severity === 'number') {
      switch (severity) {
        case 1: return HotspotReviewPriority.High;
        case 2: return HotspotReviewPriority.Medium;
        case 3: return HotspotReviewPriority.Low;
        default: return HotspotReviewPriority.Medium;
      }
    }
    
    switch (severity) {
      case VSCode.DiagnosticSeverity.Error:
        return HotspotReviewPriority.High;
      case VSCode.DiagnosticSeverity.Warning:
        return HotspotReviewPriority.Medium;
      case VSCode.DiagnosticSeverity.Information:
      case VSCode.DiagnosticSeverity.Hint:
        return HotspotReviewPriority.Low;
      default:
        return HotspotReviewPriority.Medium;
    }
  }

  private getTotalCount(cache: Map<string, any[]>): number {
    return Array.from(cache.values())
      .reduce((total, diagnostics) => total + diagnostics.length, 0);
  }

  private isAnyConnectionConfigured(): boolean {
    const sonarQubeConnections = this.connectionSettingsService.getSonarQubeConnections();
    const sonarCloudConnections = this.connectionSettingsService.getSonarCloudConnections();
    return sonarCloudConnections.length > 0 || sonarQubeConnections.length > 0;
  }

  hasFindings(): boolean {
    return this.hotspotsCache.size > 0 || this.taintVulnerabilitiesCache.size > 0;
  }

  getTotalFindingsCount(): number {
    return this.getTotalCount(this.hotspotsCache) + this.getTotalCount(this.taintVulnerabilitiesCache);
  }
} 