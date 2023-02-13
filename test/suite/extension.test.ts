/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as assert from 'assert';
import * as path from 'path';
import * as util from '../../src/util/util';
import * as FS from 'fs';
import * as os from 'os';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { sleep } from '../testutil';
import { performIsIgnoredCheck } from '../../src/extension';
import { Commands } from '../../src/util/commands';
import { Context } from 'mocha';
import { isRunningAutoBuild, isRunningOnWindows } from '../../src/util/util';
import { Uri } from 'vscode';

const sampleFolderLocation = '../../../test/samples/';

suite('Extension Test Suite', () => {

  setup(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await vscode.commands.executeCommand(Commands.SHOW_SONARLINT_OUTPUT);
  });

  test('Extension should be present', () => {
    assert.ok(util.extension);
  });

  test('should activate', function() {
    this.timeout(60 * 1000);
    return util.extension.activate()
      .then(() => {
        assert.ok(true);
      });
  });

  test('should report issue on single js file', async function() {
    skipTestOnWindowsVm(this, "Skipping test which is timing out on azure pipelines windows vm")
    const fileUri = vscode.Uri.file(path.join(__dirname, sampleFolderLocation, 'sample-js', 'main.js'));
    await checkSonarLintDiagnostics(fileUri);
  }).timeout(60 * 1000);

  test('should report issue on js file with URI-encoded characters', async function() {
    skipTestOnWindowsVm(this, "Skipping test which is timing out on azure pipelines windows vm")
    const fileUri = vscode.Uri.file(path.join(__dirname, sampleFolderLocation, 'sample-js', '# {}', 'main.js'));
    await checkSonarLintDiagnostics(fileUri)
  }).timeout(60 * 1000);

  test('consider file not ignored if it is not in workspace', async function () {
    const folder = await FS.promises.mkdtemp(path.join(os.tmpdir(), 'tmpdir'));
    const filePath = path.join(folder, 'main.js');
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

  async function checkSonarLintDiagnostics(fileUri: Uri) {
    const document = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(document);

    const diags = await waitForSonarLintDiagnostics(fileUri);

    assert.strictEqual(diags.length, 2);
    assert.strictEqual(diags[0].message, 'Remove the declaration of the unused \'i\' variable.');
    assert.strictEqual(diags[1].message, 'Unexpected var, use let or const instead.');
  }

  async function waitForSonarLintDiagnostics(fileUri) {
    let diags = getSonarLintDiagnostics(fileUri);
    while (diags.length == 0) {
      await sleep(200);
      diags = getSonarLintDiagnostics(fileUri);
    }
    return diags;
  }

  function skipTestOnWindowsVm(testContext: Context, reason: string) {
    if (isRunningOnWindows() && isRunningAutoBuild()) {
      testContext.skip();
      console.log(reason)
    }
  }
});
function getSonarLintDiagnostics(fileUri: any) {
  return vscode.languages.getDiagnostics(fileUri).filter(d => d.source == 'sonarlint');
}
