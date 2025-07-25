/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

'use strict';

import { SonarLintExtendedLanguageClient } from '../lsp/client';
import * as VSCode from 'vscode';
import {
  code2ProtocolConverter,
  getFileNameFromFullPath,
  getRelativePathWithFileNameFromFullPath,
  protocol2CodeConverter,
  pathExists
} from '../util/uri';
import { showNoActiveFileOpenWarning, showNoFileWithUriError } from '../util/showMessage';
import { AnalysisFile, CheckIssueStatusChangePermittedResponse } from '../lsp/protocol';
import { isValidRange, LocationTreeItem, SecondaryLocationsTree } from '../location/locations';
import * as protocol from '../lsp/protocol';
import { DateTime } from 'luxon';
import { adaptFlows, createDiagnosticFromIssue } from '../util/issue';
import { ContextManager } from '../contextManager';

export class IssueService {
  private static _instance: IssueService;

  static init(
    languageClient: SonarLintExtendedLanguageClient,
    secondaryLocationsTree: SecondaryLocationsTree,
    issueLocationsView: VSCode.TreeView<LocationTreeItem>
  ): void {
    IssueService._instance = new IssueService(languageClient, secondaryLocationsTree, issueLocationsView);
  }

  constructor(
    private readonly languageClient: SonarLintExtendedLanguageClient,
    private readonly secondaryLocationsTree: SecondaryLocationsTree,
    private readonly issueLocationsView: VSCode.TreeView<LocationTreeItem>
  ) {}

  static get instance(): IssueService {
    return IssueService._instance;
  }

  checkIssueStatusChangePermitted(
    folderUri: string,
    issueKey: string
  ): Promise<CheckIssueStatusChangePermittedResponse> {
    return this.languageClient.checkIssueStatusChangePermitted(folderUri, issueKey);
  }

  async checkDependencyRiskStatusChangePermitted(issueKey: string): Promise<CheckIssueStatusChangePermittedResponse> {
    const allowedTransitions = await this.languageClient.getDependencyRiskTransitions(issueKey);
    return {
      permitted: allowedTransitions.transitions.length > 0,
      allowedStatuses: allowedTransitions.transitions,
      notPermittedReason: 'You are not allowed to change the status of this dependency risk'
    };
  }

  changeIssueStatus(
    configScopeId: string,
    issueKey: string,
    newStatus: string,
    fileUri: string,
    comment: string,
    isTaintIssue: boolean
  ): Promise<void> {
    return this.languageClient.changeIssueStatus(configScopeId, issueKey, newStatus, fileUri, comment, isTaintIssue);
  }

  changeDependencyRiskStatus(
    configScopeId: string,
    dependencyRiskKey: string,
    transition: string,
    comment: string
  ): Promise<void> {
    return this.languageClient.changeDependencyRiskStatus(configScopeId, dependencyRiskKey, transition, comment);
  }

  reopenLocalIssues() {
    const currentlyOpenFileUri = VSCode.window.activeTextEditor.document.uri;
    const workspaceFolder = VSCode.workspace.getWorkspaceFolder(currentlyOpenFileUri);
    const fileRelativePath = getRelativePathWithFileNameFromFullPath(currentlyOpenFileUri.toString(), workspaceFolder);
    const unixStyleRelativePath = fileRelativePath.replace(/\\/g, '/');
    return this.languageClient.reopenResolvedLocalIssues(
      code2ProtocolConverter(workspaceFolder.uri),
      unixStyleRelativePath,
      code2ProtocolConverter(currentlyOpenFileUri)
    );
  }

  analyseOpenFileIgnoringExcludes(textDocument?: VSCode.TextDocument) {
    const textEditor = VSCode.window.activeTextEditor;
    const notebookEditor = VSCode.window.activeNotebookEditor;
    if (!textEditor && !notebookEditor && !textDocument) {
      // No active editor and no input provided either
      showNoActiveFileOpenWarning();
      return Promise.resolve();
    }
    if (textEditor || textDocument) {
      textDocument = textDocument ?? textEditor.document;
      const uri = textDocument.uri;
      return this.languageClient.analyseOpenFileIgnoringExcludes({
        uri: code2ProtocolConverter(uri),
        languageId: textDocument.languageId,
        text: textDocument.getText(),
        version: textDocument.version
      });
    } else if (notebookEditor) {
      const notebookDocument = notebookEditor.notebook;
      const cells: AnalysisFile[] = notebookDocument
        .getCells()
        .filter(cell => cell.document.languageId === 'python')
        .map(cell => {
          return {
            uri: cell.document.uri.toString(),
            languageId: cell.document.languageId,
            version: cell.document.version,
            text: cell.document.getText()
          };
        });
      return this.languageClient.analyseOpenFileIgnoringExcludes(undefined, notebookDocument, cells);
    }

    return Promise.resolve();
  }

  static async showIssue(issue: protocol.Issue) {
    const documentUri = protocol2CodeConverter(issue.fileUri);
    const exists = await pathExists(documentUri);
    if (documentUri == null || !exists) {
      showNoFileWithUriError(documentUri);
    } else {
      const editor = await VSCode.window.showTextDocument(documentUri);

      const diagnostic = createDiagnosticFromIssue(issue);

      if (!isValidRange(diagnostic.range, editor.document) || !issue.codeMatches) {
        VSCode.window.showWarningMessage(
          `SonarQube for VS Code failed to open the issue in '${getFileNameFromFullPath(issue.fileUri)}'.
           Local code does not match remote. Please make sure that the right branch is checked out.`
        );
        return;
      }

      issue.fileUri = code2ProtocolConverter(documentUri);

      if (issue.flows.length > 0) {
        issue.flows = await adaptFlows(issue);
        await IssueService.showAllLocations(issue);
      } else {
        editor.revealRange(diagnostic.range, VSCode.TextEditorRevealType.InCenter);
        editor.selection = new VSCode.Selection(diagnostic.range.start, diagnostic.range.end);
      }

      if (issue.shouldOpenRuleDescription) {
        await VSCode.commands.executeCommand('SonarLint.OpenRuleDesc', issue.ruleKey, issue.fileUri);
      }
    }
  }

  static async showAllLocations(issue: protocol.Issue) {
    // make sure the view is visible
    ContextManager.instance.setIssueLocationsContext();
    await IssueService._instance.secondaryLocationsTree.showAllLocations(issue);
    if (issue.creationDate) {
      const createdAgo = issue.creationDate
        ? DateTime.fromISO(issue.creationDate).toLocaleString(DateTime.DATETIME_MED)
        : null;
      IssueService._instance.issueLocationsView.message = createdAgo
        ? `Analyzed ${createdAgo} on '${issue.connectionId}'`
        : `Detected by SonarQube for VS Code`;
    } else {
      IssueService._instance.issueLocationsView.message = null;
    }
    if (issue.flows.length > 0) {
      IssueService._instance.issueLocationsView.reveal(
        IssueService._instance.secondaryLocationsTree.getChildren(null)[0]
      );
    }
  }
}
