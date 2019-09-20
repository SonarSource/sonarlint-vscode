/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2019 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as assert from 'assert';
import * as path from 'path';
import { after } from 'mocha';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';

const sampleFolderLocation = '../../../test/samples/';

suite('Extension Test Suite', () => {
  after(() => {
    vscode.window.showInformationMessage('All tests done!');
  });

  test('Extension should be present', () => {
    assert.ok(vscode.extensions.getExtension('sonarsource.sonarlint-vscode'));
  });

  test('should activate', function() {
    this.timeout(1 * 60 * 1000);
    return vscode.extensions
      .getExtension('sonarsource.sonarlint-vscode')
      .activate()
      .then(api => {
        assert.ok(true);
      });
  });

  test('should report issue on single js file', async function() {
    const fileUri = vscode.Uri.file(path.join(__dirname, sampleFolderLocation, 'sample-js', 'main.js'));
    const document = await vscode.workspace.openTextDocument(fileUri);
    const editor = await vscode.window.showTextDocument(document);

    var diags = await waitForSonarLintDiagnostics(fileUri);

    assert.deepEqual(diags.length, 1);
    assert.equal(diags[0].message, "Remove the declaration of the unused 'i' variable. (javascript:UnusedVariable)");

    vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  }).timeout(60 * 1000);

  async function waitForSonarLintDiagnostics(fileUri) {
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
function getSonarLintDiagnostics(fileUri: any) {
  return vscode.languages.getDiagnostics(fileUri).filter(d => d.source == 'sonarlint');
}
