/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { fail } from 'assert';
import * as vscode from 'vscode';

const MAX_WAIT_DIAGNOSTICS_MS = 20000;

interface WaitForDiagnosticsOptions {
  atLeastIssues?: number,
  timeoutMillis?: number
}

export async function waitForSonarLintDiagnostics(fileUri: vscode.Uri, options?: WaitForDiagnosticsOptions) {
  const atLeastIssues = options?.atLeastIssues || 1;
  const timeoutMillis = options?.timeoutMillis || MAX_WAIT_DIAGNOSTICS_MS;
  let diags = getSonarLintDiagnostics(fileUri);
  let elapsedMillis = 0;
  const periodMillis = 200;
  while (diags.length < atLeastIssues && elapsedMillis < timeoutMillis) {
    await sleep(periodMillis);
    diags = getSonarLintDiagnostics(fileUri);
    elapsedMillis += periodMillis;
  }
  if (options?.atLeastIssues && diags.length < atLeastIssues) {
    fail(`Expected at least ${options?.atLeastIssues} SonarLint diagnostics, got ${diags.length} after ${timeoutMillis}ms`);
  }
  return diags;
}

export function dumpLogOutput() {
  vscode.workspace.textDocuments
    .filter(t => t.languageId === 'Log')
    .forEach(t => {
      console.log(t.fileName);
      console.log(t.getText());
    });
}

function getSonarLintDiagnostics(fileUri: vscode.Uri) {
  return vscode.languages.getDiagnostics(fileUri).filter(d => d.source === 'sonarlint');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}
