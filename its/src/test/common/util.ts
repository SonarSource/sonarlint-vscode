/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';

const MAX_WAIT_DIAGNOSTICS_MS = 20000;

interface WaitForDiagnosticsOptions {
  atLeastIssues?: number,
  timeoutMillis?: number
}

export async function waitForSonarLintDiagnostics(fileUri: vscode.Uri, options?: WaitForDiagnosticsOptions) {
  const startTime = new Date();
  const atLeastIssues = options?.atLeastIssues || 1;
  const timeoutMillis = options?.timeoutMillis || MAX_WAIT_DIAGNOSTICS_MS;
  let diags = getSonarLintDiagnostics(fileUri);
  while (diags.length < atLeastIssues && new Date().getTime() - startTime.getTime() < timeoutMillis) {
    await sleep(200);
    diags = getSonarLintDiagnostics(fileUri);
  }
  return diags;
}

export function dumpLogOutput() {
  vscode.workspace.textDocuments.forEach(t => {
    if (t.languageId === 'Log') {
      console.log(t.fileName);
      console.log(t.getText());
    }
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
