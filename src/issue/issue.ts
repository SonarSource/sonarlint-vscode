/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

'use strict';

import { SonarLintExtendedLanguageClient } from '../lsp/client';
import * as VSCode from 'vscode';
import { code2ProtocolConverter, getRelativePathWithFileNameFromFullPath } from '../util/uri';
import { showNoActiveFileOpenWarning } from '../util/showMessage';

export class IssueService {
  private static _instance: IssueService;

  static init(languageClient: SonarLintExtendedLanguageClient): void {
    IssueService._instance = new IssueService(languageClient);
  }

  constructor(private readonly languageClient: SonarLintExtendedLanguageClient) {}

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
    return this.languageClient.reopenResolvedLocalIssues(code2ProtocolConverter(workspaceFolder.uri),
      unixStyleRelativePath,
      code2ProtocolConverter(currentlyOpenFileUri));
  }

  analyseOpenFileIgnoringExcludes() {
    const editor = VSCode.window.activeTextEditor;
    if (editor === undefined) {
      showNoActiveFileOpenWarning();
      return Promise.resolve();
    }
    const document = editor.document;
    return this.languageClient.analyseOpenFileIgnoringExcludes({
      uri: code2ProtocolConverter(document.uri),
      languageId: document.languageId,
      text: document.getText(),
      version: document.version
    });
  }
}
