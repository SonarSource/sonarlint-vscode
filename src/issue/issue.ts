/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

'use strict';

import { SonarLintExtendedLanguageClient } from '../lsp/client';

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

  reopenLocalIssues(configurationScopeId: string, relativePath: string, fileUri: string): Promise<void> {
    return this.languageClient.reopenResolvedLocalIssues(configurationScopeId, relativePath, fileUri);
  }
}
