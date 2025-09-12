/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import {
  FindingContextValue,
  FindingSource,
  FindingType,
  impactSeverityToIcon
} from '../findingsTreeDataProviderUtil';
import { ExtendedServer } from '../../lsp/protocol';
import { Commands } from '../../util/commands';
import { Diagnostic } from 'vscode-languageserver-types';

export class FindingNode extends vscode.TreeItem {
  public readonly key: string;
  public readonly serverIssueKey?: string;
  public range: vscode.Range;
  public contextValue: FindingContextValue;
  public readonly source: FindingSource;
  public readonly message: string;
  public readonly ruleKey: string;
  public readonly status?: number;
  public readonly isOnNewCode?: boolean;
  public readonly severity?: number;
  public readonly isAiCodeFixable: boolean;
  public readonly hasQuickFix: boolean;
  public readonly impactSeverity: ExtendedServer.ImpactSeverity;

  constructor(
    public readonly fileUri: string,
    public readonly findingType: FindingType,
    public readonly finding: Diagnostic,
    public readonly findingLabel = ''
  ) {
    super(finding.message, vscode.TreeItemCollapsibleState.None);
    this.key = finding['data'].entryKey;
    this.serverIssueKey = finding['data'].serverIssueKey;
    this.id = `${fileUri}-${this.key}`;
    this.isAiCodeFixable = finding['data']?.isAiCodeFixable ?? false;
    this.hasQuickFix = finding['data']?.hasQuickFix ?? false;
    this.range = finding.range
      ? new vscode.Range(
          finding.range.start.line,
          finding.range.start.character,
          finding.range.end.line,
          finding.range.end.character
        )
      : new vscode.Range(0, 0, 0, 0);
    this.contextValue = getContextValueForFinding(
      finding.source as FindingSource,
      this.isAiCodeFixable
    );
    this.source = finding.source as FindingSource;
    this.message = finding.message;
    this.ruleKey = (finding.code as string) || 'unknown';
    this.status = finding['data']?.status;
    this.isOnNewCode = finding['data']?.isOnNewCode;
    this.severity = finding.severity;
    this.impactSeverity = finding['data']?.impactSeverity as ExtendedServer.ImpactSeverity;
    this.description = `${findingLabel} (${this.ruleKey}) [Ln ${this.range.start.line + 1}, Col ${
      this.range.start.character
    }]`;
    this.iconPath = impactSeverityToIcon(this.impactSeverity);

    this.command = {
      command: Commands.SHOW_ALL_INFO_FOR_FINDING,
      title: 'Show All Info For Finding',
      arguments: [this]
    };
  }
}

export function getContextValueForFinding(
  source: FindingSource,
  isAiCodeFixable: boolean,
): FindingContextValue {
  switch (source) {
    case FindingSource.Latest_SonarCloud:
    case FindingSource.Latest_SonarQube:
      return isAiCodeFixable ? 'AICodeFixableTaintItem' : 'taintVulnerabilityItem';
    case FindingSource.SonarQube:
      return isAiCodeFixable ? 'AICodeFixableIssueItem' : 'issueItem';
    default:
      return 'issueItem';
  }
}
