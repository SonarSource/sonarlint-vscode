/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as assert from 'node:assert';
import * as path from 'node:path';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';

import { activateAndShowOutput, dumpLogOutput, SETUP_TEARDOWN_HOOK_TIMEOUT, waitForSonarLintDiagnostics } from '../common/util';

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

    // Check that we have the expected diagnostic
    const diags = await waitForSonarLintDiagnostics(fileUri, { atLeastIssues: 1, timeoutMillis: 45_000 });
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
      'SonarQube: Add comment',
      "SonarQube: Deactivate rule 'csharpsquid:S1186'",
      "SonarQube: Show issue details for 'csharpsquid:S1186'",
      'SonarQube: Throw NotSupportedException'
    ];
    const actualCodeActionTitles = codeActionsResult
      .filter(c => expectedActionTitles.includes(c.title))
      .map(c => c.title);
    // Order of code actions is not stable, forcing lexicographic order for assertion
    actualCodeActionTitles.sort((a, b) => a.localeCompare(b));
    assert.deepEqual(actualCodeActionTitles, expectedActionTitles);

    // Check that first fix has an edit that can be applied
    const quickFix = codeActionsResult.find(
      c => c.title === 'SonarQube: Throw NotSupportedException'
    ) as vscode.CodeAction;
    const fixApplied = await vscode.workspace.applyEdit(quickFix.edit!);
    assert.equal(fixApplied, true);

    vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  }).timeout(60 * 1000);

  suiteTeardown(function () {
    this.timeout(SETUP_TEARDOWN_HOOK_TIMEOUT);
    dumpLogOutput();
  });
});
