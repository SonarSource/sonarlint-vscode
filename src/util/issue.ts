/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

'use strict';
import { Flow, Issue } from '../lsp/protocol';
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
  // vscode line positions are 0-based
  const startPosition = new vscode.Position(startLine - 1, startLineOffset);
  const endPosition = new vscode.Position(endLine - 1, endLineOffset);
  const range = new vscode.Range(startPosition, endPosition);

  const issueDiag = new vscode.Diagnostic(range, 'params.message', DiagnosticSeverity.Warning);
  issueDiag.code = issue.ruleKey;
  issueDiag.source = `sonarlint${issue.ruleKey}`;
  return issueDiag;
}
