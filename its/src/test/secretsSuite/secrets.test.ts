/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as assert from 'assert';
import * as path from 'path';
import { TextEncoder } from 'util';
import * as fs from 'fs';
import * as url from 'url';
import * as os from 'os';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';

import { waitForSonarLintDiagnostics } from '../common/util';

const secretsFolderLocation = '../../../samples/sample-secrets';
const secretIssueMessage = 'Make sure this AWS Secret Access Key gets revoked, changed, and removed from the code.';

suite('Secrets Test Suite', () => {
  vscode.window.showInformationMessage('Starting Secrets tests.');

  test('should find secrets in yaml files', async function () {
    const fileUri = vscode.Uri.file(path.join(__dirname, secretsFolderLocation, 'file.yml'));
    const document = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(document);

    const diags = await waitForSonarLintDiagnostics(fileUri);

    assert.deepStrictEqual(diags.length, 1);
    assert.strictEqual(diags[0].message, secretIssueMessage);
  }).timeout(60 * 1000);

  test('should find secrets in plain text files with custom extensions', async function () {
    const fileUri = vscode.Uri.file(path.join(__dirname, secretsFolderLocation, 'file.customext'));
    const document = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(document);

    const diags = await waitForSonarLintDiagnostics(fileUri);

    assert.deepStrictEqual(diags.length, 1);
    assert.strictEqual(diags[0].message, secretIssueMessage);
  }).timeout(60 * 1000);

  test('should find secrets in file without extensions', async function () {
    const fileUri = vscode.Uri.file(path.join(__dirname, secretsFolderLocation, 'no_extension_file'));
    const document = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(document);

    const diags = await waitForSonarLintDiagnostics(fileUri);

    assert.deepStrictEqual(diags.length, 1);
    assert.strictEqual(diags[0].message, secretIssueMessage);
  }).timeout(60 * 1000);

  test('should find secrets in source files', async function () {
    const fileUri = vscode.Uri.file(path.join(__dirname, secretsFolderLocation, 'MyFile.kt'));
    const document = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(document);

    const diags = await waitForSonarLintDiagnostics(fileUri);

    assert.deepStrictEqual(diags.length, 1);
    assert.strictEqual(diags[0].message, secretIssueMessage);
  }).timeout(60 * 1000);

  test('should not find secrets in SCM ignored files', async function () {
    const fileUri = vscode.Uri.file(path.join(__dirname, secretsFolderLocation, 'ignored_file.yml'));
    await vscode.workspace.fs.writeFile(
      fileUri,
      new TextEncoder().encode('AWS_SECRET_KEY: h1ByXvzhN6O8/UQACtwMuSkjE5/oHmWG1MJziTDw')
    );
    await vscode.window.showTextDocument(fileUri);

    const diags = await waitForSonarLintDiagnostics(fileUri, { timeoutMillis: 5000 });

    assert.deepStrictEqual(diags.length, 0);
  }).timeout(60 * 1000);

  test('should find secrets in non git files', async function () {
    const fileName = 'non_git_file.yml';
    const tmpDirPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'tmp-'));
    const tmpFileUri = vscode.Uri.file(path.join(tmpDirPath, fileName));
    const tmpFileUrl = url.pathToFileURL(path.join(tmpDirPath, fileName));
    await fs.promises.writeFile(
      tmpFileUrl,
      new TextEncoder().encode('AWS_SECRET_KEY: h1ByXvzhN6O8/UQACtwMuSkjE5/oHmWG1MJziTDw')
    );
    await vscode.window.showTextDocument(tmpFileUri);

    const diags = await waitForSonarLintDiagnostics(tmpFileUri, { timeoutMillis: 5000 });

    assert.deepStrictEqual(diags.length, 1);
    assert.strictEqual(diags[0].message, secretIssueMessage);
  }).timeout(60 * 1000);
});
