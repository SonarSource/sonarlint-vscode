/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import { Diagnostic } from 'vscode-languageserver-types';
import { SonarLintExtendedLanguageClient } from '../lsp/client';
import { ImpactSeverity, PublishDiagnosticsParams } from '../lsp/protocol';
import { Commands } from '../util/commands';
import { getFileNameFromFullPath, getRelativePathFromFullPath } from '../util/uri';
import { getConnectionIdForFile } from '../util/bindingUtils';
import { isFocusingOnNewCode } from '../settings/settings';
import { convertVscodeDiagnosticToLspDiagnostic } from '../util/util';
import {
  FindingContextValue,
  FindingSource,
  FilterType,
  FindingType,
  HotspotReviewPriority,
  SOURCE_CONFIG,
  impactSeverityToIcon,
  getContextValueForFinding,
  isFileOpen,
  isCurrentFile,
  getFilterContextValue,
  selectAndApplyCodeAction,
  NOTEBOOK_CELL_URI_SCHEME,
  isNotebookCellUri
} from './findingsTreeDataProviderUtil';

export class FindingsFileNode extends vscode.TreeItem {
  constructor(
    public readonly fileUri: string,
    public readonly findingsCount: number,
    public readonly category?: 'new' | 'older',
    public readonly isNotebook = false,
    public readonly notebookCellUris?: string[]
  ) {
    super(getFileNameFromFullPath(fileUri), vscode.TreeItemCollapsibleState.Expanded);
    
    this.contextValue = 'findingsFileGroup';
    const categorySuffix = category ? `_${category}` : '';
    this.id = `${fileUri}${categorySuffix}`;
    this.resourceUri = vscode.Uri.parse(fileUri);
    
    const specifyWorkspaceFolderName = vscode.workspace.workspaceFolders?.length > 1;
    // no need to compute relative path if file is outside any workspace folder
    this.description = vscode.workspace.workspaceFolders ? getRelativePathFromFullPath(
      fileUri,
      vscode.workspace.getWorkspaceFolder(this.resourceUri),
      specifyWorkspaceFolderName
    ) : '';
    
    this.iconPath = vscode.ThemeIcon.File;
    
    if (category) {
      const categoryText = category === 'new' ? 'new code' : 'older code';
      this.tooltip = `${findingsCount} SonarQube Finding(s) in ${categoryText}`;
    } else {
      this.tooltip = `${findingsCount} SonarQube Finding(s)`;
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
  public readonly isAiCodeFixable: boolean;
  public readonly hasQuickFix: boolean;
  public readonly impactSeverity: ImpactSeverity;

  constructor(public readonly fileUri: string,
    public readonly findingType: FindingType,
    public readonly finding: Diagnostic,
    public readonly isNotebookFinding = false
  ) {
    super(finding.message, vscode.TreeItemCollapsibleState.None);
    this.key = finding['data'].entryKey;
    this.serverIssueKey = finding['data'].serverIssueKey;
    this.id = `${fileUri}-${this.key}`;
    this.isAiCodeFixable = finding['data']?.isAiCodeFixable ?? false;
    this.hasQuickFix = finding['data']?.hasQuickFix ?? false;
    this.range = new vscode.Range(finding.range.start.line, finding.range.start.character, finding.range.end.line, finding.range.end.character);
    this.contextValue = getContextValueForFinding(finding.source as FindingSource, this.isAiCodeFixable, this.isNotebookFinding);
    this.source = finding.source as FindingSource;
    this.message = finding.message;
    this.ruleKey = finding.code as string || 'unknown';
    this.status = finding['data']?.status;
    this.isOnNewCode = finding['data']?.isOnNewCode;
    this.vulnerabilityProbability = finding.severity as HotspotReviewPriority;
    this.severity = finding.severity;
    this.impactSeverity = finding['data']?.impactSeverity as ImpactSeverity;

    this.description = `${SOURCE_CONFIG[this.source]?.label || ''} (${this.ruleKey}) [Ln ${this.range.start.line + 1}, Col ${this.range.start.character}]`;
    this.iconPath = this.getIconForFinding(this.source);
    this.tooltip = SOURCE_CONFIG[this.source]?.tooltipText;
    
    this.command = {
      command: Commands.SHOW_ALL_INFO_FOR_FINDING,
      title: 'Show All Info For Finding',
      arguments: [this]
    }
  }

  private getIconForFinding(source: FindingSource): vscode.ThemeIcon | vscode.IconPath {
    const sourceConfig = SOURCE_CONFIG[source];
    // For security hotspots, use source-specific icons
    if (sourceConfig.icon) {
      return new vscode.ThemeIcon(sourceConfig.icon, new vscode.ThemeColor(sourceConfig.iconColor));
    }
    
    // Fallback to severity-based icon for taint vulnerabilities
    return impactSeverityToIcon(this.impactSeverity);
  }
}

export type FindingsTreeViewItem = FindingsFileNode | FindingNode | NewIssuesNode | OlderIssuesNode;
export class FindingsTreeDataProvider implements vscode.TreeDataProvider<FindingsTreeViewItem> {
  private static _instance: FindingsTreeDataProvider;
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<FindingsTreeViewItem | undefined>();
  readonly onDidChangeTreeData: vscode.Event<FindingsTreeViewItem | undefined> = this._onDidChangeTreeData.event;
  private readonly findingsCache = new Map<string, FindingNode[]>();
  private activeFilter: FilterType = FilterType.All;

  constructor(private readonly client: SonarLintExtendedLanguageClient) {
    // NOP
  }

  static init(context: vscode.ExtensionContext, client: SonarLintExtendedLanguageClient) {
    this._instance = new FindingsTreeDataProvider(client);
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
        vscode.commands.executeCommand('SonarLint.SuggestFix', finding.key, finding.fileUri);
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

    context.subscriptions.push(
      vscode.commands.registerCommand(Commands.TRIGGER_FETCH_CODE_ACTIONS_COMMAND, async (finding: FindingNode) => {
        const codeActions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
          'vscode.executeCodeActionProvider',
          vscode.Uri.parse(finding.fileUri),
          finding.range,
          vscode.CodeActionKind.QuickFix.value
        );
        const codeActionsFromSonarQube = codeActions.filter(action => action.title.startsWith('SonarQube: '));
        await selectAndApplyCodeAction(codeActionsFromSonarQube);
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand(Commands.SHOW_ALL_FINDINGS, () => {
        this._instance.setFilter(FilterType.All);
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand(Commands.SHOW_FIXABLE_ISSUES_ONLY, () => {
        this._instance.setFilter(FilterType.Fix_Available);
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand(Commands.SHOW_OPEN_FILES_ONLY, () => {
        this._instance.setFilter(FilterType.Open_Files_Only);
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand(Commands.SHOW_HIGH_SEVERITY_ONLY, () => {
        this._instance.setFilter(FilterType.High_Severity_Only);
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand(Commands.SHOW_CURRENT_FILE_ONLY, () => {
        this._instance.setFilter(FilterType.Current_File_Only);
      })
    );

    // Initialize the context for the filter
    vscode.commands.executeCommand('setContext', 'sonarqube.findingsFilter', getFilterContextValue(this._instance.activeFilter));
  }

  static get instance(): FindingsTreeDataProvider {
    return FindingsTreeDataProvider._instance;
  }

  showAllInfoForFinding(finding: FindingNode) {
    if (finding.findingType === FindingType.SecurityHotspot) {
      vscode.commands.executeCommand(Commands.SHOW_HOTSPOT_LOCATION, finding);
      const showRuleDescriptionCommand = finding.contextValue === 'newHotspotItem' ? Commands.SHOW_HOTSPOT_RULE_DESCRIPTION : Commands.SHOW_HOTSPOT_DETAILS;
      vscode.commands.executeCommand(showRuleDescriptionCommand, finding);
    } else if (finding.findingType === FindingType.TaintVulnerability) {
      vscode.commands.executeCommand('SonarLint.ShowTaintVulnerabilityFlows', finding.serverIssueKey, getConnectionIdForFile(finding.fileUri));
      vscode.commands.executeCommand('SonarLint.ShowIssueDetailsCodeAction', finding.key, finding.fileUri);
    } else if (finding.findingType === FindingType.Issue) {
      if (!finding.isNotebookFinding) {
        // showing all locations for notebook cells is not supported
        vscode.commands.executeCommand('SonarLint.ShowIssueFlows', finding.key, finding.fileUri);
      }
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

  updateIssues(fileUri: string, diagnostics: vscode.Diagnostic[]) {
    const findingNodes = this.convertIssuesToFindingNodes(fileUri, diagnostics);
    this.updateFindingsForFile(fileUri, findingNodes, FindingType.Issue);
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

  private convertIssuesToFindingNodes(fileUri: string, diagnostics: vscode.Diagnostic[]): FindingNode[] {
    return diagnostics.map(diagnostic => new FindingNode(fileUri, FindingType.Issue, convertVscodeDiagnosticToLspDiagnostic(diagnostic), isNotebookCellUri(fileUri)));
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
      const allFindings = element.isNotebook
        ? this.getFindingsForNotebook(element.notebookCellUris)
        : this.getFindingsForFile(element.fileUri);
      return this.filterFindings(allFindings, element.category);
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
      const newFindings = findings.filter(finding => finding.isOnNewCode && this.matchesFilter(finding));
      if (newFindings.length > 0) {
        this.addFileNode(fileUri, files, newFindings.length, 'new');
      }
    });
    
    return files;
  }

  private getOlderIssuesFiles(): FindingsFileNode[] {
    const files: FindingsFileNode[] = [];
    
    this.findingsCache.forEach((findings, fileUri) => {
      const olderFindings = findings.filter(finding => !finding.isOnNewCode && this.matchesFilter(finding));
      if (olderFindings.length > 0) {
        this.addFileNode(fileUri, files, olderFindings.length, 'older');
      }
    });
    
    return files;
  }

  getRootFiles(): FindingsFileNode[] {
    const files: FindingsFileNode[] = [];
    
    this.findingsCache.forEach((findings, fileUri) => {
      const filteredFindings = findings.filter(finding => this.matchesFilter(finding));
      if (filteredFindings.length > 0) {
        this.addFileNode(fileUri, files, filteredFindings.length);
      }
    });
    
    return files;
  }

  private addFileNode(fileOrCellUri: string, existingFiles: FindingsFileNode[], findingsCount: number, category?: 'new' | 'older') {
    if (fileOrCellUri.startsWith(NOTEBOOK_CELL_URI_SCHEME)) {
      const notebookCellUri = vscode.Uri.parse(fileOrCellUri);
      // register only one notebook file for (possible) multiple cells
      const notebookUri = vscode.Uri.from({scheme: 'file', path: notebookCellUri.path}).toString();
      const notebookFile = existingFiles.find(file => file.fileUri === notebookUri);
      if (notebookFile) {
        notebookFile.notebookCellUris.push(fileOrCellUri);
        return;
      }
      existingFiles.push(new FindingsFileNode(notebookUri, findingsCount, category, true, [fileOrCellUri]));
    } else {
      existingFiles.push(new FindingsFileNode(fileOrCellUri, findingsCount, category));
    }
  }

  private matchesFilter(finding: FindingNode): boolean {
    if (this.activeFilter === FilterType.All) {
      return true;
    } else if (this.activeFilter === FilterType.Fix_Available) {
      return finding.isAiCodeFixable || finding.hasQuickFix;
    } else if (this.activeFilter === FilterType.Open_Files_Only) {
      return isFileOpen(finding.fileUri);
    } else if (this.activeFilter === FilterType.High_Severity_Only) {
      return finding.impactSeverity === ImpactSeverity.HIGH || finding.impactSeverity === ImpactSeverity.BLOCKER;
    } else if (this.activeFilter === FilterType.Current_File_Only) {
      return isCurrentFile(finding.fileUri);
    }
    return false;
  }

  private getFindingsForNotebook(notebookCellUris: string[]): FindingNode[] {
    return Array.from(notebookCellUris)
      .map(uri => this.findingsCache.get(uri) || [])
      .reduce((acc, findings) => acc.concat(findings), []);
  }

  private getFindingsForFile(fileUri: string): FindingNode[] {
    return  this.findingsCache.get(fileUri) || [];
  }

  private filterFindings(findings: FindingNode[], category?: 'new' | 'older'): FindingNode[] {
    let filteredFindings = findings.filter(finding => this.matchesFilter(finding));
    
    if (category) {
      const lookingForNew = category === 'new';
      // looking for new and is new, or looking for older and is older
      filteredFindings = filteredFindings.filter(finding => finding.isOnNewCode === lookingForNew);
    }

    return filteredFindings;
  }

  getHotspotsForFile(fileUri: string): FindingNode[] {
    return this.findingsCache.get(fileUri)?.filter(finding => finding.findingType === FindingType.SecurityHotspot) || [];
  }

  getTaintsForFile(fileUri: string): FindingNode[] {
    return this.findingsCache.get(fileUri)?.filter(finding => finding.findingType === FindingType.TaintVulnerability) || [];
  }

  getTaintVulnerabilitiesForFile(fileUri: string): FindingNode[] {
    return this.findingsCache.get(fileUri)?.filter(finding => finding.findingType === FindingType.TaintVulnerability) || [];
  }

  getTotalFindingsCount(): number {
    return Array.from(this.findingsCache.values())
      .reduce((total, findings) => total + findings.length, 0);
  }

  setFilter(filter: FilterType) {
    this.activeFilter = filter;
    this.refresh();
    vscode.commands.executeCommand('setContext', 'sonarqube.findingsFilter', getFilterContextValue(filter));
    this.client.findingsFiltered(filter);
  }

  getActiveFilter(): FilterType {
    return this.activeFilter;
  }

  getFilteredFindingsCount(): number {
    if (this.activeFilter === FilterType.All) {
      return this.getTotalFindingsCount();
    }
    
    return Array.from(this.findingsCache.values())
      .reduce((total, findings) => {
        return total + findings.filter(finding => this.matchesFilter(finding)).length;
      }, 0);
  }
}
