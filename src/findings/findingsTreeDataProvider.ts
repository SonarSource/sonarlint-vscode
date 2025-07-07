/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import { Diagnostic } from 'vscode-languageserver-types';
import { PublishDiagnosticsParams } from '../lsp/protocol';
import { Commands } from '../util/commands';
import { getFileNameFromFullPath, getRelativePathFromFullPath } from '../util/uri';
import { getConnectionIdForFile } from '../util/bindingUtils';
import { Severity } from '../util/issue';
import { isFocusingOnNewCode } from '../settings/settings';
import { getSeverity } from '../util/util';

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
  Latest_SonarQube = 'Latest SonarQube Server Analysis', // taint
  Latest_SonarCloud = 'Latest SonarQube Cloud Analysis', // taint
  Remote = 'remote', // hotspot that matched remote one; Still on-the-fly analysis
}

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

const SOURCE_CONFIG: Record<FindingSource, {
  icon?: string;
  iconColor?: string;
  label: string;
  tooltipText: string;
}> = {
  [FindingSource.SonarQube]: {
    icon: 'security-hotspot',
    iconColor: 'descriptionForeground',
    label: 'Security Hotspot',
    tooltipText: 'This Security Hotspot only exists locally'
  },
  [FindingSource.Remote]: {
    icon: 'security-hotspot', 
    iconColor: 'descriptionForeground',
    label: 'Security Hotspot',
    tooltipText: 'This Security Hotspot exists on remote project'
  },
  [FindingSource.Latest_SonarQube]: {
    label: 'Taint Vulnerability',
    tooltipText: 'This Taint Vulnerability was detected by SonarQube Server'
  },
  [FindingSource.Latest_SonarCloud]: {
    label: 'Taint Vulnerability',
    tooltipText: 'This Taint Vulnerability was detected by SonarQube Cloud'
  }
};

const severityToIcon = new Map([
  [Severity.Error, new vscode.ThemeIcon('error', new vscode.ThemeColor('problemsErrorIcon.foreground'))],
  [Severity.Warning, new vscode.ThemeIcon('warning', new vscode.ThemeColor('problemsWarningIcon.foreground'))],
  [Severity.Info, new vscode.ThemeIcon('info', new vscode.ThemeColor('problemsInfoIcon.foreground'))],
  [Severity.Hint, new vscode.ThemeIcon('info', new vscode.ThemeColor('editorHint.foreground'))] // issues on old code
]);

export class FindingsFileNode extends vscode.TreeItem {
  constructor(
    public readonly fileUri: string,
    public readonly findingsCount: number,
    public readonly category?: 'new' | 'older'
  ) {
    super(getFileNameFromFullPath(fileUri), vscode.TreeItemCollapsibleState.Expanded);
    
    this.contextValue = 'findingsFileGroup';
    const categorySuffix = category ? `_${category}` : '';
    this.id = `${fileUri}${categorySuffix}`;
    this.resourceUri = vscode.Uri.parse(fileUri);
    
    const specifyWorkspaceFolderName = vscode.workspace.workspaceFolders?.length > 1;
    this.description = getRelativePathFromFullPath(
      fileUri,
      vscode.workspace.getWorkspaceFolder(this.resourceUri),
      specifyWorkspaceFolderName
    );
    
    this.iconPath = vscode.ThemeIcon.File;
    
    if (category) {
      const categoryText = category === 'new' ? 'new code' : 'older code';
      this.tooltip = `${findingsCount} SonarQube Security Finding(s) in ${categoryText}`;
    } else {
      this.tooltip = `${findingsCount} SonarQube Security Finding(s)`;
    }
  }
}

export class NewIssuesNode extends vscode.TreeItem {
  constructor() {
    super('New Findings', vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'newIssuesGroup';
    this.id = 'new-issues';
    this.iconPath = new vscode.ThemeIcon('git-pull-request-new-changes');
    this.tooltip = 'Findings in new code';
  }
}

export class OlderIssuesNode extends vscode.TreeItem {
  constructor() {
    super('Older Findings', vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = 'olderIssuesGroup';
    this.id = 'older-issues';
    this.iconPath = new vscode.ThemeIcon('history');
    this.tooltip = 'Findings in older code';
  }
}

export class FindingNode extends vscode.TreeItem {
  public readonly key: string;
  public readonly serverIssueKey?: string;
  public range: vscode.Range;
  public readonly contextValue: FindingContextValue;
  public readonly source: FindingSource;
  public readonly message: string;
  public readonly ruleKey: string;
  public readonly status?: number;
  public readonly isOnNewCode?: boolean;
  public readonly vulnerabilityProbability?: HotspotReviewPriority;
  public readonly severity?: number;

  constructor(public readonly fileUri,
    public readonly findingType: FindingType,
    public readonly finding: Diagnostic
  ) {
    super(finding.message, vscode.TreeItemCollapsibleState.None);
    this.key = finding['data'].entryKey;
    this.serverIssueKey = finding['data'].serverIssueKey;
    this.id = `${fileUri}-${this.key}`;
    this.range = new vscode.Range(finding.range.start.line, finding.range.start.character, finding.range.end.line, finding.range.end.character);
    this.contextValue = getContextValueForFinding(finding.source as FindingSource, finding['data']?.isAiCodeFixable ?? false);
    this.source = finding.source as FindingSource;
    this.message = finding.message;
    this.ruleKey = finding.code as string || 'unknown';
    this.status = finding['data']?.status;
    this.isOnNewCode = finding['data']?.isOnNewCode;
    this.vulnerabilityProbability = finding.severity as HotspotReviewPriority;
    this.severity = getSeverity(finding.severity);

    this.description = `${SOURCE_CONFIG[this.source]?.label} (${this.ruleKey})`;
    this.iconPath = this.getIconForFinding(this.source);
    this.tooltip = SOURCE_CONFIG[this.source]?.tooltipText;
    this.tooltip = SOURCE_CONFIG[this.source]?.tooltipText;
    
    this.command = {
      command: Commands.SHOW_ALL_INFO_FOR_FINDING,
      title: 'Show All Info For Finding',
      arguments: [this]
    }
  }

  private getIconForFinding(source: FindingSource): vscode.ThemeIcon {
    const sourceConfig = SOURCE_CONFIG[source];
    // For security hotspots, use source-specific icons
    if (sourceConfig.icon) {
      return new vscode.ThemeIcon(sourceConfig.icon, new vscode.ThemeColor(sourceConfig.iconColor));
    }
    
    // Fallback to severity-based icon for taint vulnerabilities
    return severityToIcon.get(this.severity);
  }
}

export type FindingContextValue = 'newHotspotItem' | 'knownHotspotItem' | 'taintVulnerabilityItem' | 'AICodeFixableTaintVulnerabilityItem';

function getContextValueForFinding(source: FindingSource, isAiCodeFixable: boolean): FindingContextValue {
  if (source === FindingSource.Remote) {
    return 'knownHotspotItem';
  } else if ((source === FindingSource.Latest_SonarCloud || source === FindingSource.Latest_SonarQube) && isAiCodeFixable) {
    return 'AICodeFixableTaintVulnerabilityItem';
  } else if (source === FindingSource.Latest_SonarCloud || source === FindingSource.Latest_SonarQube) {
    return 'taintVulnerabilityItem';
  } else {
    return 'newHotspotItem';
  }
}

export type FindingsTreeViewItem = FindingsFileNode | FindingNode | NewIssuesNode | OlderIssuesNode;

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

    context.subscriptions.push(
      vscode.commands.registerCommand(Commands.TRIGGER_BROWSE_TAINT_COMMAND, (finding: FindingNode) => {
        // call server-side command to open the taint vulnerability on the remote server
        vscode.commands.executeCommand('SonarLint.BrowseTaintVulnerability', finding.serverIssueKey, finding.fileUri);
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand(Commands.TRIGGER_AI_CODE_FIX_COMMAND, (finding: FindingNode) => {
        // call server-side command to to suggest fix
        vscode.commands.executeCommand('SonarLint.SuggestTaintFix', finding.key, finding.fileUri);
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand(Commands.TRIGGER_RESOLVE_TAINT_COMMAND, (finding: FindingNode) => {
        const fileUri = finding.fileUri;
        const workspaceUri = vscode.workspace.getWorkspaceFolder(vscode.Uri.parse(fileUri)).uri.toString();
        const issueKey = finding.serverIssueKey;
        const isTaintIssue = true;
        
        vscode.commands.executeCommand(Commands.RESOLVE_ISSUE, workspaceUri, issueKey, fileUri, isTaintIssue);
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
      vscode.commands.executeCommand('SonarLint.ShowTaintVulnerabilityFlows', finding.serverIssueKey, getConnectionIdForFile(finding.fileUri));
      vscode.commands.executeCommand('SonarLint.ShowIssueDetailsCodeAction', finding.key, finding.fileUri);
    }
  }

  refresh() {
    this._onDidChangeTreeData.fire(null);
  }

  updateHotspots(hotspotsPerFile: PublishDiagnosticsParams) {
    const findingNodes = this.convertHotspotsToFindingNodes(hotspotsPerFile);
    this.updateFindingsForFile(hotspotsPerFile.uri, findingNodes, FindingType.SecurityHotspot);
  }

  updateTaintVulnerabilities(fileUri: string, diagnostics: Diagnostic[]) {
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
    return hotspotsPerFile.diagnostics.map(diagnostic => new FindingNode(hotspotsPerFile.uri, FindingType.SecurityHotspot, diagnostic));
  }

  private convertTaintVulnerabilitiesToFindingNodes(fileUri: string, diagnostics: Diagnostic[]): FindingNode[] {
    return diagnostics.map(diagnostic => new FindingNode(fileUri, FindingType.TaintVulnerability, diagnostic));
  }

  getTreeItem(element: FindingsTreeViewItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: FindingsTreeViewItem): vscode.ProviderResult<FindingsTreeViewItem[]> {
    if (!element) {
      return this.getRootItems();
    }

    if (element instanceof NewIssuesNode) {
      return this.getNewIssuesFiles();
    }

    if (element instanceof OlderIssuesNode) {
      return this.getOlderIssuesFiles();
    }

    if (element instanceof FindingsFileNode) {
      return this.getFindingsForFile(element.fileUri, element.category);
    }

    return [];
  }

  getParent(element: FindingsTreeViewItem): vscode.ProviderResult<FindingsTreeViewItem> {
    if (element instanceof NewIssuesNode || element instanceof OlderIssuesNode) {
      return null;
    }

    if (element instanceof FindingsFileNode) {
      if (isFocusingOnNewCode()) {
        // If the file node has a category, return the appropriate parent
        if (element.category === 'new') {
          return new NewIssuesNode();
        } else if (element.category === 'older') {
          return new OlderIssuesNode();
        }
        return null;
      }
      return null;
    }

    // For FindingNode, find the parent file
    const parentFile = this.getRootFiles().find(file => file.fileUri === element.fileUri);
    if (parentFile) {
      if (isFocusingOnNewCode()) {
        return element.isOnNewCode ? new NewIssuesNode() : new OlderIssuesNode();
      }
      return parentFile;
    }

    return null;
  }

  private getRootItems(): FindingsTreeViewItem[] {
    if (isFocusingOnNewCode()) {
      const newIssuesFiles = this.getNewIssuesFiles();
      const olderIssuesFiles = this.getOlderIssuesFiles();
      
      const items: FindingsTreeViewItem[] = [];
      
      if (newIssuesFiles.length > 0) {
        items.push(new NewIssuesNode());
      }
      
      if (olderIssuesFiles.length > 0) {
        items.push(new OlderIssuesNode());
      }
      
      return items;
    } else {
      return this.getRootFiles();
    }
  }

  private getNewIssuesFiles(): FindingsFileNode[] {
    const files: FindingsFileNode[] = [];
    
    this.findingsCache.forEach((findings, fileUri) => {
      const newFindings = findings.filter(finding => finding.isOnNewCode);
      if (newFindings.length > 0) {
        files.push(new FindingsFileNode(fileUri, newFindings.length, 'new'));
      }
    });
    
    return files;
  }

  private getOlderIssuesFiles(): FindingsFileNode[] {
    const files: FindingsFileNode[] = [];
    
    this.findingsCache.forEach((findings, fileUri) => {
      const olderFindings = findings.filter(finding => !finding.isOnNewCode);
      if (olderFindings.length > 0) {
        files.push(new FindingsFileNode(fileUri, olderFindings.length, 'older'));
      }
    });
    
    return files;
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

  private getFindingsForFile(fileUri: string, category?: 'new' | 'older'): FindingNode[] {
    const findings = this.findingsCache.get(fileUri) || [];
    if (category) {
      const lookingForNew = category === 'new';
      // looking for new and is new, or looking for older and is older
      return findings.filter(finding => finding.isOnNewCode === lookingForNew);
    }
    return findings.map(finding => new FindingNode(fileUri, finding.findingType, finding.finding));
  }

  getHotspotsAndTaintsForFile(fileUri: string): FindingNode[] {
    return this.findingsCache.get(fileUri)?.filter(finding => this.isSecurityFinding(finding)) || [];
  }

  private isSecurityFinding(finding: FindingNode) {
    return finding.findingType === FindingType.SecurityHotspot
      || finding.findingType === FindingType.TaintVulnerability;
  }

  getTaintVulnerabilitiesForFile(fileUri: string): FindingNode[] {
    return this.findingsCache.get(fileUri)?.filter(finding => finding.findingType === FindingType.TaintVulnerability) || [];
  }

  getTotalFindingsCount(): number {
    return Array.from(this.findingsCache.values())
      .reduce((total, findings) => total + findings.length, 0);
  }
}
