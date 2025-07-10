/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import { SonarLintExtendedLanguageClient } from '../../../src/lsp/client';
import { assert, expect } from 'chai';
import { ListPotentialSecurityIssuesTool } from '../../../src/languageModelTools/listPotentialSecurityIssuesTool';
import * as sinon from 'sinon';

let toolCalledCount = {
  success: 0,
  failure: 0
};

const mockClient = {
  lmToolCalled: (name: string, success: boolean) => {
    // Mock implementation of the LMToolCalled method
    if (success) {
      toolCalledCount.success++;
    } else {
      toolCalledCount.failure++;
    }
    console.log(`Tool called: ${name}, Success: ${success}`);
  }
} as SonarLintExtendedLanguageClient;

suite('List Security Hotspots Language Model Tool Test Suite', () => {
  const underTest = new ListPotentialSecurityIssuesTool(mockClient);
  setup(async () => {
    toolCalledCount.success = 0;
    toolCalledCount.failure = 0;
    sinon.restore(); // Restore any previous stubs
  });

  test('Should prepare invocation with confirmation', async () => {
    const confirmation = await underTest.prepareInvocation(
      { input: { filePath: '/path/to/myFile.py' } }, // options
      new vscode.CancellationTokenSource().token // token
    );
    assert.strictEqual(confirmation.invocationMessage, 'Fetching Security Hotspots and Taint Vulnerabilities for the file...');
    assert.strictEqual(confirmation.confirmationMessages.title, 'Retrieve detected Security Hotspots and Taint Vulnerabilities for a file');
    assert.strictEqual(
      confirmation.confirmationMessages.message.value,
      `Retrieve the detected Security Hotspots and Taint Vulnerabilities for the file **/path/to/myFile.py**?`
    );
  });

  test('Should invoke Connected Mode tool when not bound', async () => {
    const workspaceFolder = vscode.workspace.workspaceFolders[0];

    // Open file inside the bound workspace folder
    const fileUri = vscode.Uri.file(workspaceFolder.uri.fsPath + '/sample.py');
    await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(fileUri);

    const toolCalledSpy = sinon.spy(vscode.lm, 'invokeTool');

    const result = await underTest.invoke(
      { toolInvocationToken: undefined, input: { filePath: '/path/to/myFile.py' } }, // options
      new vscode.CancellationTokenSource().token // token
    );

    assert.strictEqual(toolCalledCount.failure, 1);
    assert.strictEqual(result.content.length, 2);
    assert.strictEqual(
      (result.content[0] as vscode.LanguageModelTextPart).value,
      `The workspace folder is not bound to a remote project on SonarQube (Cloud, Server).
         SonarQube for IDE needs to be in Connected Mode to retrieve the detected Security Hotspots.`
    );
    assert.strictEqual(
      (result.content[1] as vscode.LanguageModelTextPart).value,
      'I have initiated the binding process for you.'
    );
    expect(toolCalledSpy.calledOnce).to.be.true;
    expect(toolCalledSpy.calledWith('sonarqube_setUpConnectedMode')).to.be.true;
  });
});
