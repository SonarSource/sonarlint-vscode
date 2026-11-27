/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as assert from 'node:assert';
import * as path from 'node:path';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';

import { waitForSonarLintDiagnostics, dumpLogOutput, SETUP_TEARDOWN_HOOK_TIMEOUT } from '../common/util';

const sampleFolderLocation = '../../../samples/';

const ONE_MINUTE_MS = 60_000;

suite('Extension Test Suite', () => {

  suiteSetup(function () {
    this.timeout(30 * 1000);
    vscode.window.showInformationMessage('Start all tests.');
  });

  teardown(function () {
    this.timeout(SETUP_TEARDOWN_HOOK_TIMEOUT);
    dumpLogOutput();
  });

  test('Extension should be present', () => {
    assert.ok(vscode.extensions.getExtension('sonarsource.sonarlint-vscode'));
  });

  test('should report issue on single js file', async function () {
    const ext = vscode.extensions.getExtension('sonarsource.sonarlint-vscode')!;
    await ext.activate();

    vscode.commands.executeCommand('SonarLint.ShowSonarLintOutput');

    const fileUri = vscode.Uri.file(path.join(__dirname, sampleFolderLocation, 'sample-js', 'main.js'));
    const document = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(document);

    const diags = await waitForSonarLintDiagnostics(fileUri, { atLeastIssues: 2, timeoutMillis: 30_000 });

    const issues = diags.map(d => [d.code, d.range.start.line]).sort();
    assert.deepStrictEqual(issues, [['javascript:S1481', 1], ['javascript:S3504', 1]]);
    assert.ok(diags.every(d => d.message.length > 0));

    vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  }).timeout(ONE_MINUTE_MS);

  test('should report issue on single yaml file', async function () {
    const ext = vscode.extensions.getExtension('sonarsource.sonarlint-vscode')!;
    await ext.activate();

    vscode.commands.executeCommand('SonarLint.ShowSonarLintOutput');

    const fileUri = vscode.Uri.file(path.join(__dirname, sampleFolderLocation, 'sample-js', 'lambda.yaml'));
    const document = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(document);

    const diags = await waitForSonarLintDiagnostics(fileUri);

    assert.strictEqual(diags.length, 1);
    assert.strictEqual(diags[0].message, "Remove the declaration of the unused 'x' variable.");

    vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  }).timeout(ONE_MINUTE_MS);
});
