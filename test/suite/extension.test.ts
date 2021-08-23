/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2021 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as assert from 'assert';
import * as path from 'path';
import * as util from '../../src/util';
import * as FS from 'fs';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import {performIsIgnoredCheck} from "../../src/extension";

const sampleFolderLocation = '../../../test/samples/';

suite('Extension Test Suite', () => {
  test('Extension should be present', () => {
    assert.ok(util.extension);
  });

  test('should activate', function() {
    this.timeout(1 * 60 * 1000);
    return util.extension.activate()
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
    assert.equal(diags[0].message, "Remove the declaration of the unused 'i' variable.");

    vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  }).timeout(60 * 1000);

  test('consider file not ignored if it is not in workspace', async function () {
    const folder = await FS.promises.mkdtemp(path.join('../../../', 'tmpdir'));
    const filePath = folder + 'main.js';
    await FS.promises.writeFile(filePath, 'var i = 0;');

    const isIgnored = await performIsIgnoredCheck(folder + '/main.js', async () => true);

    assert.strictEqual(isIgnored, false);
  }).timeout(60 * 1000);

  test('should return git command results for files from workspace', async function () {
    const fileUri = vscode.Uri.file(path.join(__dirname, sampleFolderLocation, 'sample-js', 'main.js'));

    const ignored = await performIsIgnoredCheck(fileUri.toString(), async () => true);
    const notIgnored = await performIsIgnoredCheck(fileUri.toString(), async () => false);

    assert.strictEqual(ignored, true);
    assert.strictEqual(notIgnored, false);
  }).timeout(60 * 1000);

  test('should consider file not ignored if git extension is not enabled', async function () {
    const fileUri = vscode.Uri.file(path.join(__dirname, sampleFolderLocation, 'sample-js', 'main.js'));

    const notIgnored = await performIsIgnoredCheck(fileUri.toString(), async () => {
      throw new Error('Git model not found')
    });

    assert.strictEqual(notIgnored, false);
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
