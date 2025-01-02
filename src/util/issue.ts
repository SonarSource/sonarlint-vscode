/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

'use strict';
import { Flow, Issue, TextRange } from '../lsp/protocol';
import * as vscode from 'vscode';
import * as protocol from '../lsp/protocol';
import { DiagnosticSeverity } from 'vscode';

export async function adaptFlows(issue: Issue) {
  return Promise.all(
    issue.flows.map(async flow => {
      flow.locations = await adaptLocations(flow);
      return flow;
    })
  );
}

export async function adaptLocations(flow: Flow) {
  return Promise.all(
    flow.locations.map(async location => {
      location.filePath = location.uri;
      return location;
    })
  );
}

export function createDiagnosticFromIssue(issue: protocol.Issue) {
  const { startLine, startLineOffset, endLine, endLineOffset } = issue.textRange;
  let startPosition = new vscode.Position(0, 0);
  let endPosition = new vscode.Position(0, 0);
  let range = new vscode.Range(startPosition, endPosition);
  if (!isFileLevelIssue(issue.textRange)) {
    // this is NOT a file-level issue
    // vscode line positions are 0-based
    startPosition = new vscode.Position(startLine - 1, startLineOffset);
    endPosition = new vscode.Position(endLine - 1, endLineOffset);
    range = new vscode.Range(startPosition, endPosition);
  }
  const issueDiag = new vscode.Diagnostic(range, 'params.message', DiagnosticSeverity.Warning);
  issueDiag.code = issue.ruleKey;
  issueDiag.source = `sonarqube(${issue.ruleKey})`;
  issueDiag.message = issue.message;
  return issueDiag;
}

export function isFileLevelIssue(textRange: TextRange) {
  return textRange.startLine === 0 || textRange.endLine === 0;
}
