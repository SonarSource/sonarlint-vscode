/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2021 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';

export async function waitForSonarLintDiagnostics(fileUri: vscode.Uri) {
  var diags = getSonarLintDiagnostics(fileUri);
  while (diags.length == 0) {
    await sleep(200);
    diags = getSonarLintDiagnostics(fileUri);
  }
  return diags;
}

function getSonarLintDiagnostics(fileUri: vscode.Uri) {
  return vscode.languages.getDiagnostics(fileUri).filter(d => d.source == 'sonarlint');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}
