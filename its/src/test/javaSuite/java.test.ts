/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2020 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as assert from 'assert';
import * as path from 'path';
import * as CompareVersions from 'compare-versions';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as myExtension from '../extension';

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

      var diags = await waitForSonarLintDiagnostics(fileUri);

      assert.deepEqual(diags.length, 1);
      assert.equal(diags[0].message, 'Replace this use of System.out or System.err by a logger.');

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

      var diags = await waitForSonarLintDiagnostics(fileUri);

      assert.deepEqual(diags.length, 1);
      assert.equal(diags[0].message, 'Add at least one assertion to this test case.');

      vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    } else {
      this.skip();
    }
  }).timeout(120 * 1000);

  async function waitForSonarLintDiagnostics(fileUri: vscode.Uri) {
    var diags = getSonarLintDiagnostics(fileUri);
    while (diags.length == 0) {
      await sleep(200);
      diags = getSonarLintDiagnostics(fileUri);
    }
    return diags;
  }

  function sleep(ms: number): Promise<void> {
    return new Promise(resolve => {
      setTimeout(resolve, ms);
    });
  }
});

function getSonarLintDiagnostics(fileUri: vscode.Uri) {
  return vscode.languages.getDiagnostics(fileUri).filter(d => d.source == 'sonarlint');
}
