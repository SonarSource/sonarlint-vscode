/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as assert from 'assert';
import * as FS from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { sleep } from '../testutil';
import { Commands } from '../../src/util/commands';
import * as util from '../../src/util/util';
import { isFileIgnoredByScm } from '../../src/scm/scm';
import { sampleFolderLocation } from './commons';

suite('Extension Test Suite', () => {

  suiteSetup('wait for extension activation', async function() {
    this.timeout(60_000);
    await util.extension.activate();
  });

  setup(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await vscode.commands.executeCommand(Commands.SHOW_SONARLINT_OUTPUT);
  });

  test('Extension should be present', () => {
    assert.ok(util.extension);
  });

  test('should report issue on single js file', async function() {
    const fileUri = vscode.Uri.file(path.join(__dirname, sampleFolderLocation, 'sample-js', 'main.js'));
    await checkSonarLintDiagnostics(fileUri);
  }).timeout(60 * 1000);

  test('should report issue on js file with URI-encoded characters', async function() {
    const fileUri = vscode.Uri.file(path.join(__dirname, sampleFolderLocation, 'sample-js', '# {}', 'main.js'));
    await checkSonarLintDiagnostics(fileUri)
  }).timeout(60 * 1000);

  test('consider file not ignored if it is not in workspace', async function() {
    const folder = await FS.promises.mkdtemp(path.join(os.tmpdir(), 'tmpdir'));
    const filePath = path.join(folder, 'main.js');
    await FS.promises.writeFile(filePath, 'var i = 0;');
    const fileUri = vscode.Uri.parse(folder + '/main.js');

    const isIgnored = await isFileIgnoredByScm(folder + '/main.js', async () => [fileUri]);

    assert.strictEqual(isIgnored, false);
  }).timeout(60 * 1000);

  test('should return git command results for files from workspace', async function() {
    const fileUri = vscode.Uri.file(path.join(__dirname, sampleFolderLocation, 'sample-js', 'main.js'));

    const ignored = await isFileIgnoredByScm(fileUri.toString(), async () => []);
    const notIgnored = await isFileIgnoredByScm(fileUri.toString(), async () => [fileUri]);

    assert.strictEqual(ignored, true);
    assert.strictEqual(notIgnored, false);
  }).timeout(60 * 1000);

  test('should consider file not ignored if git extension is not enabled', async function() {
    const fileUri = vscode.Uri.file(path.join(__dirname, sampleFolderLocation, 'sample-js', 'main.js'));

    const notIgnored = await isFileIgnoredByScm(fileUri.toString(), async () => {
      throw new Error('Git model not found');
    });

    assert.strictEqual(notIgnored, false);
  }).timeout(60 * 1000);

  async function checkSonarLintDiagnostics(fileUri: vscode.Uri) {
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
});
function getSonarLintDiagnostics(fileUri: any) {
  return vscode.languages.getDiagnostics(fileUri).filter(d => d.source == 'sonarlint');
}
