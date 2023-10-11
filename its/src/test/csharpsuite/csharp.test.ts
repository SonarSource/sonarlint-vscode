/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as assert from 'assert';
import * as path from 'path';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';

import { activateAndShowOutput, dumpLogOutput, waitForSonarLintDiagnostics } from '../common/util';

const sampleFolderLocation = '../../../samples/';

suite('CSharp Test Suite', () => {

  suiteSetup(async function () {
    this.timeout(30 * 1000);
    vscode.window.showInformationMessage('Start CSharp tests.');
    vscode.commands.executeCommand('workbench.panel.markers.view.focus');
  
    await activateAndShowOutput();
  });

  test('should report issue on csharp file', async function () {
    const fileUri = vscode.Uri.file(path.join(__dirname, sampleFolderLocation, 'sample-cs', 'CSSample', 'Program.cs'));
    const document = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(document);

    // Check that we have 2 diagnostics in the right order
    const diags = await waitForSonarLintDiagnostics(fileUri, { atLeastIssues: 1, timeoutMillis: 30_000 });
    assert.deepEqual(
      diags.map(d => [d.code, d.message]),
      [
        [
          'csharpsquid:S1186',
          "Add a nested comment explaining why this method is empty, throw a 'NotSupportedException' or complete the implementation."
        ]
      ]
    );

    // Check that the exception-related diagnostic has 3 code actions
    const rangeInMiddleOfThrowsMyException = new vscode.Range(4, 21, 4, 22);
    const codeActionsResult = (await vscode.commands.executeCommand<(vscode.Command | vscode.CodeAction)[]>(
      'vscode.executeCodeActionProvider',
      document.uri,
      rangeInMiddleOfThrowsMyException,
      vscode.CodeActionKind.QuickFix.value
    ));
    // With old versions of VSCode, code actions are not necessarily filtered on kind
    const expectedActionTitles = [
      'SonarLint: Add comment',
      "SonarLint: Deactivate rule 'csharpsquid:S1186'",
      "SonarLint: Open description of rule 'csharpsquid:S1186'",
      'SonarLint: Throw NotSupportedException'
    ];
    const actualCodeActionTitles = codeActionsResult
      .filter(c => expectedActionTitles.indexOf(c.title) >= 0)
      .map(c => c.title);
    // Order of code actions is not stable, forcing lexicographic order for assertion
    actualCodeActionTitles.sort();
    assert.deepEqual(actualCodeActionTitles, expectedActionTitles);

    // Check that first fix has an edit that can be applied
    const quickFix = codeActionsResult.filter(
      c => c.title === 'SonarLint: Throw NotSupportedException'
    )[0] as vscode.CodeAction;
    const fixApplied = await vscode.workspace.applyEdit(quickFix.edit!);
    assert.equal(fixApplied, true);

    vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  }).timeout(60 * 1000);

  suiteTeardown(() => {
    dumpLogOutput();
  });
});
