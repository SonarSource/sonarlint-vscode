/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import { SonarLintExtendedLanguageClient } from '../../../src/lsp/client';
import { assert, expect } from 'chai';
import { AnalyzeFileTool } from '../../../src/languageModelTools/analyzeFileTool';
import * as sinon from 'sinon';
import { IssueService } from '../../../src/issue/issue';
import * as path from 'path';

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
  }
} as SonarLintExtendedLanguageClient;

suite('Exclude File or Folder Language Model Tool Test Suite', () => {
  setup(() => {
    toolCalledCount.failure = 0;
    toolCalledCount.success = 0;
  });

  const underTest = new AnalyzeFileTool(mockClient);
  test('Should prepare invocation with confirmation', async () => {
    const confirmation = await underTest.prepareInvocation(
      { input: { filePath: '/path/to/my/file.py' } }, // options
      new vscode.CancellationTokenSource().token // token
    );
    assert.strictEqual(confirmation.invocationMessage, 'Running SonarQube for IDE local analysis...');
    assert.strictEqual(confirmation.confirmationMessages.title, 'Analyze File');
    assert.strictEqual(
      confirmation.confirmationMessages.message.value,
      `Run SonarQube for IDE analysis on **/path/to/my/file.py**?`
    );
  });

  test('Should open file and trigger analysis', async () => {
    sinon.restore();

    const sampleFileUri = vscode.Uri.file(path.join(__dirname, '../../../../test/samples/sample-for-bindings/sample.py'));

    const openTextDocument = sinon.stub(vscode.workspace, 'openTextDocument');
    const showTextDocument = sinon.stub(vscode.window, 'showTextDocument');
    const analyseOpenFileIgnoringExcludes = sinon.stub(IssueService.instance, 'analyseOpenFileIgnoringExcludes');
    const executeCommand = sinon.stub(vscode.commands, 'executeCommand');

    const result = await underTest.invoke(
      { input: { filePath: sampleFileUri.fsPath }, toolInvocationToken: undefined }, // options
      new vscode.CancellationTokenSource().token // token
    );

    expect(openTextDocument.calledOnce).to.be.true;
    expect(openTextDocument.firstCall.args[0].fsPath).to.equal(sampleFileUri.fsPath);
    expect(showTextDocument.calledOnce).to.be.true;
    expect(showTextDocument.firstCall.args[0].fsPath).to.equal(sampleFileUri.fsPath);
    const showOptions = showTextDocument.firstCall.args[1] as vscode.TextDocumentShowOptions;
    expect(showOptions.viewColumn).to.equal(vscode.ViewColumn.Active);
    expect(showOptions.preserveFocus).to.be.true;
    expect(showOptions.preview).to.be.true;
    expect(analyseOpenFileIgnoringExcludes.calledOnce).to.be.true;
    expect(executeCommand.calledOnce).to.be.true;
    expect(executeCommand.firstCall.args[0]).to.equal('SonarQube.Findings.focus');
    expect(toolCalledCount.success).to.equal(1, 'too many calls to lmToolCalled');
    expect(result.content.length).to.equal(1);
    expect((result.content[0] as vscode.LanguageModelTextPart).value).to
      .equal(`SonarQube analysis triggered for file: '${sampleFileUri.fsPath}'.
         Detected code quality and security issues will be shown in the PROBLEMS view.`);

    sinon.restore();
  });
});
