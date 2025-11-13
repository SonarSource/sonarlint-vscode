/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

'use strict';

import * as vscode from 'vscode';

import { ExtendedClient } from '../lsp/protocol';

export async function adaptFlows(issue: ExtendedClient.Issue) {
  return Promise.all(
    issue.flows.map(async flow => {
      flow.locations = await adaptLocations(flow);
      return flow;
    })
  );
}

export async function adaptLocations(flow: ExtendedClient.Flow) {
  return Promise.all(
    flow.locations.map(async location => {
      location.filePath = location.uri;
      return location;
    })
  );
}

export function createDiagnosticFromIssue(issue: ExtendedClient.Issue) {
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
  const issueDiag = new vscode.Diagnostic(range, 'params.message', vscode.DiagnosticSeverity.Warning);
  issueDiag.code = issue.ruleKey;
  issueDiag.source = `sonarqube(${issue.ruleKey})`;
  issueDiag.message = issue.message;
  return issueDiag;
}

export function isFileLevelIssue(textRange: ExtendedClient.TextRange) {
  return textRange.startLine === 0 || textRange.endLine === 0;
}
