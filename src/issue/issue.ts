/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

'use strict';

import { SonarLintExtendedLanguageClient } from '../lsp/client';
import * as VSCode from 'vscode';
import { code2ProtocolConverter, getFileNameFromFullPath, getRelativePathWithFileNameFromFullPath, protocol2CodeConverter } from '../util/uri';
import { showNoActiveFileOpenWarning } from '../util/showMessage';
import { AnalysisFile } from '../lsp/protocol';
import { Commands } from '../util/commands';
import { isValidRange, LocationTreeItem, SecondaryLocationsTree } from '../location/locations';
import * as protocol from '../lsp/protocol';
import { DateTime } from 'luxon';
import { adaptFlows, createDiagnosticFromIssue } from '../util/issue';

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

  analyseOpenFileIgnoringExcludes() {
    const textEditor = VSCode.window.activeTextEditor;
    const notebookEditor = VSCode.window.activeNotebookEditor;
    if (textEditor === undefined && notebookEditor === undefined) {
      showNoActiveFileOpenWarning();
      return Promise.resolve();
    }
    if (notebookEditor) {
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
    if (textEditor) {
      const textDocument = textEditor.document;
      const uri = textDocument.uri;
      return this.languageClient.analyseOpenFileIgnoringExcludes({
        uri: code2ProtocolConverter(uri),
        languageId: textDocument.languageId,
        text: textDocument.getText(),
        version: textDocument.version
      });
    }
    return Promise.resolve();
  }

  static async showIssue(issue: protocol.Issue) {
    const documentUri = protocol2CodeConverter(issue.fileUri);
    if (documentUri == null) {
      VSCode.window
        .showErrorMessage(
          `Could not find file '${issue.fileUri}' in the current workspace.
Please make sure that the right folder is open and bound to the right project on the server,
 and that the file has not been removed or renamed.`,
          'Show Documentation'
        )
        .then(action => {
          if (action === 'Show Documentation') {
            VSCode.commands.executeCommand(Commands.OPEN_BROWSER, VSCode.Uri.parse('TODO'));
          }
        });
    } else {
      const editor = await VSCode.window.showTextDocument(documentUri);

      const diagnostic = createDiagnosticFromIssue(issue);

      if (!isValidRange(diagnostic.range, editor.document) || !issue.codeMatches) {
        VSCode.window.showWarningMessage(
          `SonarLint failed to open a SonarQube issue in '${getFileNameFromFullPath(issue.fileUri)}'.
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
      await VSCode.commands.executeCommand(
        'SonarLint.OpenRuleDescCodeAction',
        issue.ruleKey,
        code2ProtocolConverter(documentUri),
        ''
      );
    }
  }

  static async showAllLocations(issue: protocol.Issue) {
    await IssueService._instance.secondaryLocationsTree.showAllLocations(issue);
    if (issue.creationDate) {
      const createdAgo = issue.creationDate
        ? DateTime.fromISO(issue.creationDate).toLocaleString(DateTime.DATETIME_MED)
        : null;
      IssueService._instance.issueLocationsView.message = createdAgo
        ? `Analyzed ${createdAgo} on '${issue.connectionId}'`
        : `Detected by SonarLint`;
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
