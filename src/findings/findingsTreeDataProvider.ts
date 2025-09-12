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
import { ExtendedClient, ExtendedServer } from '../lsp/protocol';
import { Commands } from '../util/commands';
import { getConnectionIdForFile } from '../util/bindingUtils';
import { isFocusingOnNewCode } from '../settings/settings';
import { convertVscodeDiagnosticToLspDiagnostic } from '../util/util';
import {
  FilterType,
  FindingType,
  isFileOpen,
  isCurrentFile,
  getFilterContextValue,
  selectAndApplyCodeAction,
  NOTEBOOK_CELL_URI_SCHEME,
  isNotebookCellUri
} from './findingsTreeDataProviderUtil';
import { resolveIssueMultiStepInput } from '../issue/resolveIssue';
import { FindingNode } from './findingTypes/findingNode';
import { NotebookFindingNode } from './findingTypes/notebookFindingNode';
import { HotspotNode } from './findingTypes/hotspotNode';
import { FindingsFileNode } from './findingsFileNode';
import { NotebookNode } from './notebookNode';
import { FindingsFolderNode } from './findingsFolderNode';
import { DependencyRiskNode } from './findingTypes/dependencyRiskNode';
import { TaintVulnerabilityNode } from './findingTypes/taintVulnerabilityNode';

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

    context.subscriptions.push(
      vscode.commands.registerCommand(Commands.CHANGE_DEPENDENCY_RISK_STATUS, (finding: FindingNode) => {
        this._instance.changeDependencyRiskStatus(finding);
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
      if (!(finding instanceof NotebookFindingNode)) {
        // showing all locations for notebook cells is not supported
        vscode.commands.executeCommand('SonarLint.ShowIssueFlows', finding.key, finding.fileUri);
      }
      vscode.commands.executeCommand('SonarLint.ShowIssueDetailsCodeAction', finding.key, finding.fileUri);
    } else if (finding.findingType === FindingType.DependencyRisk) {
      this.client.dependencyRiskInvestigatedLocally();
      this.client.openDependencyRiskInBrowser(finding.fileUri, finding.key);
    }
  }

  refresh() {
    this._onDidChangeTreeData.fire(null);
  }

  updateHotspots(hotspotsPerFile: ExtendedClient.PublishDiagnosticsParams) {
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

  updateDependencyRisks(dependencyRisksPerFolder: ExtendedClient.PublishDiagnosticsParams) {
    const findingNodes = this.convertDependencyRisksToFindingNodes(dependencyRisksPerFolder.uri, dependencyRisksPerFolder.diagnostics);
    this.updateFindingsForFile(dependencyRisksPerFolder.uri, findingNodes, FindingType.DependencyRisk);
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

  private convertHotspotsToFindingNodes(hotspotsPerFile: ExtendedClient.PublishDiagnosticsParams): FindingNode[] {
    return hotspotsPerFile.diagnostics.map(diagnostic => new HotspotNode(hotspotsPerFile.uri, diagnostic));
  }

  private convertTaintVulnerabilitiesToFindingNodes(fileUri: string, diagnostics: Diagnostic[]): FindingNode[] {
    return diagnostics.map(diagnostic => new TaintVulnerabilityNode(fileUri, diagnostic));
  }

  private convertIssuesToFindingNodes(fileUri: string, diagnostics: vscode.Diagnostic[]): FindingNode[] {
    return diagnostics.map(diagnostic => isNotebookCellUri(fileUri) ?
     new NotebookFindingNode(fileUri, convertVscodeDiagnosticToLspDiagnostic(diagnostic)) :
     new FindingNode(fileUri, FindingType.Issue, convertVscodeDiagnosticToLspDiagnostic(diagnostic)));
  }

  private convertDependencyRisksToFindingNodes(folderUri: string, diagnostics: Diagnostic[]): FindingNode[] {
    return diagnostics.map(diagnostic => new DependencyRiskNode(folderUri, diagnostic));
  }

  getTreeItem(element: FindingsTreeViewItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: FindingsTreeViewItem): Promise<FindingsTreeViewItem[]> {
    if (!element) {
      return await this.getRootItems();
    }

    if (element instanceof NewIssuesNode) {
      return await this.getNewIssuesFiles();
    }

    if (element instanceof OlderIssuesNode) {
      return this.getOlderIssuesFiles();
    }

    if (element instanceof FindingsFileNode) {
      const allFindings = element instanceof NotebookNode ? 
        this.getFindingsForNotebook(element.notebookCellUris) :
        this.getFindingsForFile(element.fileUri);
      return this.filterFindings(allFindings, element.category);
    }

    return [];
  }

  async getParent(element: FindingsTreeViewItem): Promise<FindingsTreeViewItem> {
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

    const rootFiles = await this.getRootFiles();
    const parentFile = rootFiles.find(file => file.fileUri === element.fileUri);
    if (parentFile) {
      if (isFocusingOnNewCode()) {
        return element.isOnNewCode ? new NewIssuesNode() : new OlderIssuesNode();
      }
      return parentFile;
    }

    return null;
  }

  private async getRootItems(): Promise<FindingsTreeViewItem[]> {
    if (isFocusingOnNewCode()) {
      const newIssuesFiles = await this.getNewIssuesFiles();
      const olderIssuesFiles = await this.getOlderIssuesFiles();
      
      const items: FindingsTreeViewItem[] = [];
      
      if (newIssuesFiles.length > 0) {
        items.push(new NewIssuesNode());
      }
      
      if (olderIssuesFiles.length > 0) {
        items.push(new OlderIssuesNode());
      }
      
      return items;
    } else {
      return await this.getRootFiles();
    }
  }

  private async getNewIssuesFiles(): Promise<FindingsFileNode[]> {
    const files: FindingsFileNode[] = [];

    for (const [fileUri, findings] of this.findingsCache.entries()) {
      const newFindings = findings.filter(finding => finding.isOnNewCode && this.matchesFilter(finding));
      if (newFindings.length > 0) {
        await this.addFileNode(fileUri, files, newFindings.length, 'new');
      }
    }
    
    return files;
  }

  private async getOlderIssuesFiles(): Promise<FindingsFileNode[]> {
    const files: FindingsFileNode[] = [];

    for (const [fileUri, findings] of this.findingsCache.entries()) {
      const olderFindings = findings.filter(finding => !finding.isOnNewCode && this.matchesFilter(finding));
      if (olderFindings.length > 0) {
        await this.addFileNode(fileUri, files, olderFindings.length, 'older');
      }
    }
    
    return files;
  }

  async getRootFiles(): Promise<FindingsFileNode[]> {
    const files: FindingsFileNode[] = [];

    for (const [fileUri, findings] of this.findingsCache.entries()) {
      const filteredFindings = findings.filter(finding => this.matchesFilter(finding));
      if (filteredFindings.length > 0) {
        await this.addFileNode(fileUri, files, filteredFindings.length);
      }
    }
    
    return files;
  }

  private async addFileNode(fileOrCellUri: string, existingFiles: (FindingsFileNode | NotebookNode)[], findingsCount: number, category?: 'new' | 'older') {
    if (fileOrCellUri.startsWith(NOTEBOOK_CELL_URI_SCHEME)) {
      const notebookCellUri = vscode.Uri.parse(fileOrCellUri);
      // register only one notebook file for (possible) multiple cells
      const notebookUri = vscode.Uri.from({scheme: 'file', path: notebookCellUri.path}).toString();
      const notebookFile = existingFiles.find(file => file.fileUri === notebookUri);
      if (notebookFile) {
        (notebookFile as NotebookNode).notebookCellUris.push(fileOrCellUri);
        return;
      }
      existingFiles.push(new NotebookNode(notebookUri, findingsCount, category, [fileOrCellUri]));
    } else {
      const uri = vscode.Uri.parse(fileOrCellUri);
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.type & vscode.FileType.Directory) {
        existingFiles.push(new FindingsFolderNode(fileOrCellUri, findingsCount, category));
      } else {
        existingFiles.push(new FindingsFileNode(fileOrCellUri, findingsCount, category));
      }
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
      return finding.impactSeverity === ExtendedServer.ImpactSeverity.HIGH ||
        finding.impactSeverity === ExtendedServer.ImpactSeverity.BLOCKER;
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

  async changeDependencyRiskStatus(finding: FindingNode) {
    resolveIssueMultiStepInput(finding.fileUri, finding.key, finding.fileUri, false, true);
  }
}
