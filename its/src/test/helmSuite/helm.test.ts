/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as assert from 'assert';
import * as path from 'path';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';

import { waitForSonarLintDiagnostics } from '../common/util';

const sampleHelmFolderLocation = '../../../samples/sample-helm/';

suite('Helm Test Suite', () => {

  test('should report issues on Helm chart', async function () {
    const ext = vscode.extensions.getExtension('sonarsource.sonarlint-vscode')!;
    await ext.activate();

    vscode.commands.executeCommand('SonarLint.ShowSonarLintOutput');

    const fileUri = vscode.Uri.file(path.join(__dirname, sampleHelmFolderLocation, 'templates', 'pod.yaml'));
    const document = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(document);

    const diags = await waitForSonarLintDiagnostics(fileUri);

    assert.strictEqual(diags.length, 1);
    assert.strictEqual(diags[0].message, "Specify a storage request for this container.");

    vscode.commands.executeCommand('workbench.action.closeActiveEditor');

  }).timeout(60_000);

});
