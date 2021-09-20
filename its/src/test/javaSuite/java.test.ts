/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2021 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as assert from 'assert';
import * as path from 'path';
import * as CompareVersions from 'compare-versions';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';

import { waitForSonarLintDiagnostics } from '../common/util';

const sampleFolderLocation = '../../../samples/';
const sampleJavaFolderLocation = '../../../samples/sample-java-maven-multi-module/';

suite('Java Test Suite', () => {
  vscode.window.showInformationMessage('Start java tests.');

  test('Extension should be present', () => {
    assert.ok(vscode.extensions.getExtension('sonarsource.sonarlint-vscode'));
  });

  test('Java extension should be present', () => {
    assert.ok(vscode.extensions.getExtension('redhat.java'));
  });

  test('should report issue on java file', async function () {
    const vscodeJavaVersion = vscode.extensions.getExtension('redhat.java')?.packageJSON.version;
    if (CompareVersions.compare(vscodeJavaVersion, '0.56', '>=')) {
      const fileUri = vscode.Uri.file(
        path.join(
          __dirname,
          sampleFolderLocation,
          'sample-java-maven-multi-module',
          'module-java/src/main/java/edu/marcelo/App.java'
        )
      );
      const document = await vscode.workspace.openTextDocument(fileUri);
      const editor = await vscode.window.showTextDocument(document);

      // Check that we have 2 diagnostics in the right order
      const diags = await waitForSonarLintDiagnostics(fileUri);
      assert.deepEqual(diags.map(d => [ d.code, d.message ]), [
        [ 'java:S1130', 'Remove the declaration of thrown exception \'edu.marcelo.App$MyException\', as it cannot be thrown from method\'s body.' ],
        [ 'java:S106', 'Replace this use of System.out or System.err by a logger.' ]
      ]);

      // Check that the exception-related diagnostic has 3 code actions
      const rangeInMiddleOfThrowsMyException = new vscode.Range(8, 54, 8, 54);
      const codeActionsResult = (await vscode.commands.executeCommand<(vscode.Command | vscode.CodeAction)[]>('vscode.executeCodeActionProvider', document.uri, rangeInMiddleOfThrowsMyException, vscode.CodeActionKind.QuickFix.value))!;
      // With old versions of VSCode, code actions are not necessarily filtered on kind
      const expectedActionTitles = [
        'Remove "MyException"',
        "Open description of SonarLint rule 'java:S1130'",
        "Deactivate rule 'java:S1130'"
      ];
      const actualCodeActionTitles = codeActionsResult.filter(c => expectedActionTitles.indexOf(c.title) >= 0).map(c => c.title);
      assert.deepEqual(actualCodeActionTitles, expectedActionTitles);

      // Check that first fix has an edit that can be applied
      const quickFix = codeActionsResult.filter(c => c.title === 'Remove "MyException"')[0] as vscode.CodeAction;
      const fixApplied = await vscode.workspace.applyEdit(quickFix.edit!);
      assert.equal(fixApplied, true);

      // Wait for refresh of diagnostics
      await new Promise((resolve, reject) => {
        try {
          vscode.languages.onDidChangeDiagnostics(e => resolve());
        } catch(e) {
          reject(e);
        }
      });

      // Check that application of fix actually fixed the issue
      const newDiags = await waitForSonarLintDiagnostics(fileUri);
      assert.deepEqual(newDiags.map(d => [ d.code, d.message ]), [
        [ 'java:S106', 'Replace this use of System.out or System.err by a logger.' ],
        [ 'java:S3985', 'Remove this unused private "MyException" class.' ]
      ]);

      vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    } else {
      this.skip();
    }
  }).timeout(60 * 1000);

  test('should report issue on single java test file', async function () {
    const vscodeJavaVersion = vscode.extensions.getExtension('redhat.java')?.packageJSON.version;
    if (CompareVersions.compare(vscodeJavaVersion, '0.56', '>=')) {
      const fileUri = vscode.Uri.file(
        path.join(__dirname, sampleJavaFolderLocation, 'module-java/src/test/java/edu/marcelo', 'AppTest.java')
      );
      const document = await vscode.workspace.openTextDocument(fileUri);
      const editor = await vscode.window.showTextDocument(document);

      const diags = await waitForSonarLintDiagnostics(fileUri);

      assert.deepEqual(diags.length, 1);
      assert.equal(diags[0].message, 'Add at least one assertion to this test case.');

      vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    } else {
      this.skip();
    }
  }).timeout(120 * 1000);
});
