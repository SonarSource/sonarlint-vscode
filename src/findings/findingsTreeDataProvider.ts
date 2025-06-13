/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import { ProviderResult } from 'vscode';
import { PublishDiagnosticsParams } from '../lsp/protocol';
import { Commands } from '../util/commands';
import { getFileNameFromFullPath, getRelativePathFromFullPath } from '../util/uri';

export enum HotspotReviewPriority {
  High = 1,
  Medium = 2,
  Low = 3
}

export enum FindingType {
  SecurityHotspot = 'hotspot',
  TaintVulnerability = 'taint',
}

export enum FindingSource {
  SonarQube = 'sonarqube', // on-the-fly analysis
  Latest_SonarQube = 'Latest SonarQube Server Analysis',
  Latest_SonarCloud = 'Latest SonarQube Cloud Analysis',
  Remote = 'remote', // hotspot that matched remote one; Still on-the-fly analysis
}

type FindingContextValue = 'newHotspotItem' | 'knownHotspotItem' | 'taintVulnerabilityItem';

export interface Finding {
  key: string;
  serverIssueKey?: string;
  contextValue: FindingContextValue;
  type: FindingType;
  source: FindingSource;
  severity?: number;
  vulnerabilityProbability?: HotspotReviewPriority;
  message: string;
  ruleKey: string;
  fileUri: string;
  status: number;
}

// Source configuration for visual representation
const SOURCE_CONFIG = {
  [FindingSource.SonarQube]: {
    icon: 'security-hotspot',
    iconColor: 'editorInfo.foreground',
    label: 'Security Hotspot',
    tooltipText: 'This Security Hotspot exists on remote project'
  },
  [FindingSource.Remote]: {
    icon: 'security-hotspot', 
    iconColor: 'editorInfo.foreground',
    label: 'Security Hotspot',
    tooltipText: 'This Security Hotspot only exists locally'
  },
  [FindingSource.Latest_SonarQube]: {
    icon: 'use-severity', // Special marker to use severity-based icon
    iconColor: 'use-severity',
    label: 'Taint Vulnerability',
    tooltipText: 'This Taint Vulnerability was detected by SonarQube Server'
  },
  [FindingSource.Latest_SonarCloud]: {
    icon: 'use-severity', // Special marker to use severity-based icon
    iconColor: 'use-severity', 
    label: 'Taint Vulnerability',
    tooltipText: 'This Taint Vulnerability was detected by SonarQube Cloud'
  }
};

const severityToIcon = new Map([
  [1, new vscode.ThemeIcon('error', new vscode.ThemeColor('problemsErrorIcon.foreground'))],
  [2, new vscode.ThemeIcon('warning', new vscode.ThemeColor('problemsWarningIcon.foreground'))],
  [3, new vscode.ThemeIcon('info', new vscode.ThemeColor('problemsInfoIcon.foreground'))]
]);

export class FindingsFileNode extends vscode.TreeItem {
  constructor(
    public readonly fileUri: string,
    public readonly findingsCount: number
  ) {
    super(getFileNameFromFullPath(fileUri), vscode.TreeItemCollapsibleState.Expanded);
    
    this.contextValue = 'findingsFileGroup';
    this.id = `file-${fileUri}`;
    this.resourceUri = vscode.Uri.parse(fileUri);
    
    const specifyWorkspaceFolderName = vscode.workspace.workspaceFolders?.length > 1;
    this.description = getRelativePathFromFullPath(
      fileUri,
      vscode.workspace.getWorkspaceFolder(this.resourceUri),
      specifyWorkspaceFolderName
    );
    
    this.iconPath = vscode.ThemeIcon.File;
    this.tooltip = `${findingsCount} SonarQube Security Finding(s)`;
  }
}

export class FindingNode extends vscode.TreeItem {
  constructor(public readonly key: string,
    public readonly serverIssueKey: string,
    public readonly range: vscode.Range,
    public readonly contextValue: 'newHotspotItem' | 'knownHotspotItem' | 'taintVulnerabilityItem',
    public readonly source: FindingSource,
    public readonly message: string,
    public readonly ruleKey: string,
    public readonly fileUri: string,
    public readonly status: number,
    public readonly findingType: FindingType,
    public readonly vulnerabilityProbability?: HotspotReviewPriority,
    public readonly severity?: number,
  ) {
    super(message, vscode.TreeItemCollapsibleState.None);
    
    this.id = `${fileUri}-${key}`;
    this.key = key;
    this.fileUri = fileUri;
    
    this.description = `${SOURCE_CONFIG[source]?.label} (${ruleKey})`;
    this.iconPath = this.getIconForFinding(source, severity);
    this.tooltip = SOURCE_CONFIG[source]?.tooltipText;
    
    this.command = {
      command: Commands.SHOW_ALL_INFO_FOR_FINDING,
      title: 'Show All Info For Finding',
      arguments: [this]
    };
  }

  private getIconForFinding(source: FindingSource, severity?: number): vscode.ThemeIcon {
    const sourceConfig = SOURCE_CONFIG[source];
    
    // For Latest_SonarQube and Latest_SonarCloud, use severity-based icons
    if (sourceConfig?.icon === 'use-severity') {
      return severityToIcon.get(severity);
    }
    
    // For other sources, use source-specific icons
    if (sourceConfig) {
      return new vscode.ThemeIcon(sourceConfig.icon, new vscode.ThemeColor(sourceConfig.iconColor));
    }
    
    // Fallback to severity-based icon
    return severityToIcon.get(this.severity);
  }
}

function getContextValueForFinding(source: FindingSource): 'newHotspotItem' | 'knownHotspotItem' | 'taintVulnerabilityItem' {
  if (source === FindingSource.Remote) {
    return 'knownHotspotItem';
  } else if (source === FindingSource.Latest_SonarCloud || source === FindingSource.Latest_SonarQube) {
    return 'taintVulnerabilityItem';
  } else {
    return 'newHotspotItem';
  }
}

export type FindingsTreeViewItem = FindingsFileNode | FindingNode;

export class FindingsTreeDataProvider implements vscode.TreeDataProvider<FindingsTreeViewItem> {
  private static _instance: FindingsTreeDataProvider;
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<FindingsTreeViewItem | undefined>();
  readonly onDidChangeTreeData: vscode.Event<FindingsTreeViewItem | undefined> = this._onDidChangeTreeData.event;
  private readonly findingsCache = new Map<string, FindingNode[]>();

  static init(context: vscode.ExtensionContext) {
    this._instance = new FindingsTreeDataProvider();
    context.subscriptions.push(
      vscode.commands.registerCommand(Commands.SHOW_ALL_INFO_FOR_FINDING, (finding: FindingNode) => {
        this._instance.showAllInfoForFinding(finding);
      })
    );
  }

  static get instance(): FindingsTreeDataProvider {
    return FindingsTreeDataProvider._instance;
  }

  private showAllInfoForFinding(finding: FindingNode) {
    if (finding.findingType === FindingType.SecurityHotspot) {
      vscode.commands.executeCommand(Commands.SHOW_HOTSPOT_LOCATION, finding);
      const showRuleDescriptionCommand = finding.contextValue === 'newHotspotItem' ? Commands.SHOW_HOTSPOT_RULE_DESCRIPTION : Commands.SHOW_HOTSPOT_DETAILS;
      vscode.commands.executeCommand(showRuleDescriptionCommand, finding);
    } else if (finding.findingType === FindingType.TaintVulnerability) {
      vscode.commands.executeCommand(Commands.SHOW_ALL_LOCATIONS, [finding.key, finding.fileUri]);
    }
  }

  refresh() {
    this._onDidChangeTreeData.fire(null);
  }

  updateHotspots(hotspotsPerFile: PublishDiagnosticsParams) {
    const findingNodes = this.convertHotspotsToFindingNodes(hotspotsPerFile);
    this.updateFindingsForFile(hotspotsPerFile.uri, findingNodes, FindingType.SecurityHotspot);
  }

  updateTaintVulnerabilities(fileUri: string, diagnostics: vscode.Diagnostic[]) {
    const findingNodes = this.convertTaintVulnerabilitiesToFindingNodes(fileUri, diagnostics);
    this.updateFindingsForFile(fileUri, findingNodes, FindingType.TaintVulnerability);
  }

  private updateFindingsForFile(fileUri: string, newFindings: FindingNode[], findingType: FindingType) {
    const existingFindings = this.findingsCache.get(fileUri) || [];
    
    // Remove existing findings of this type
    const otherFindings = existingFindings.filter(f => f.findingType !== findingType);
    
    // Add new findings
    const allFindings = [...otherFindings, ...newFindings];
    
    if (allFindings.length > 0) {
      this.findingsCache.set(fileUri, allFindings);
    } else {
      this.findingsCache.delete(fileUri);
    }
    
    this.refresh();
  }

  private convertHotspotsToFindingNodes(hotspotsPerFile: PublishDiagnosticsParams): FindingNode[] {
    return hotspotsPerFile.diagnostics.map(diagnostic => new FindingNode(
      diagnostic['data'].entryKey ?? diagnostic.code as string,
      diagnostic['data']?.serverIssueKey?.toString(),
      new vscode.Range(diagnostic.range.start.line, diagnostic.range.start.character, diagnostic.range.end.line, diagnostic.range.end.character),
      getContextValueForFinding(diagnostic.source as FindingSource),
      diagnostic.source as FindingSource, // Hotspots are typically detected locally
      diagnostic.message,
      diagnostic.code as string || 'unknown',
      hotspotsPerFile.uri,
      diagnostic['data']?.status,
      FindingType.SecurityHotspot,
      diagnostic.severity,
    ));
  }

  private convertTaintVulnerabilitiesToFindingNodes(fileUri: string, diagnostics: vscode.Diagnostic[]): FindingNode[] {
    return diagnostics.map(diagnostic => new FindingNode(
      diagnostic['data'] ?? diagnostic.code as string,
      diagnostic['data'] ?? diagnostic.code as string,
      diagnostic.range,
      getContextValueForFinding(diagnostic.source as FindingSource),
      diagnostic.source as FindingSource,
      diagnostic.message,
      diagnostic.code as string || 'unknown',
      fileUri,
      null,
      FindingType.TaintVulnerability,
      null,
      diagnostic.severity,
    ));
  }

  getTreeItem(element: FindingsTreeViewItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: FindingsTreeViewItem): ProviderResult<FindingsTreeViewItem[]> {
    if (!element) {
      return this.getRootFiles();
    }

    if (element instanceof FindingsFileNode) {
      return this.getFindingsForFile(element.fileUri);
    }

    return [];
  }

  getParent(element: FindingsTreeViewItem): vscode.ProviderResult<FindingsTreeViewItem> {
    if (element instanceof FindingsFileNode) {
      return null;
    }

    return this.getRootFiles().find(file => file.fileUri === element.fileUri);
  }

  getRootFiles(): FindingsFileNode[] {
    const files: FindingsFileNode[] = [];
    
    this.findingsCache.forEach((findings, fileUri) => {
      if (findings.length > 0) {
        files.push(new FindingsFileNode(fileUri, findings.length));
      }
    });
    
    return files;
  }

  private getFindingsForFile(fileUri: string): FindingNode[] {
    const findings = this.findingsCache.get(fileUri) || [];
    return findings.map(finding => new FindingNode(
      finding.key,
      finding.serverIssueKey,
      finding.range,
      finding.contextValue,
      finding.source,
      finding.message,
      finding.ruleKey,
      fileUri,
      finding.status,
      finding.findingType,
      finding.vulnerabilityProbability,
      finding.severity,
    ));
  }

  getHotspotsForFile(fileUri: string): FindingNode[] {
    return this.findingsCache.get(fileUri)?.filter(finding => finding.findingType === FindingType.SecurityHotspot) || [];
  }

  hasFindings(): boolean {
    return this.findingsCache.size > 0;
  }

  getTotalFindingsCount(): number {
    return Array.from(this.findingsCache.values())
      .reduce((total, findings) => total + findings.length, 0);
  }
} 