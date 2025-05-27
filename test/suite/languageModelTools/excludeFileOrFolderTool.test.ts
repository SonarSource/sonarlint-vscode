/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import { ExcludeFileOrFolderTool } from '../../../src/languageModelTools/excludeFileOrFolderTool';
import { SonarLintExtendedLanguageClient } from '../../../src/lsp/client';
import { SONARLINT_CATEGORY } from '../../../src/settings/settings';
import { assert } from 'chai';

const CONNECTED_MODE_SETTINGS_SONARQUBE = 'connectedMode.connections.sonarqube';
const BINDING_SETTINGS = 'connectedMode.project';
const TEST_SONARQUBE_CONNECTION = {
  connectionId: 'test',
  serverUrl: 'https://test.sonarqube.com'
};
const TEST_BINDING = {
  connectionId: 'test',
  projectKey: 'test.project.key'
};

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
  const underTest = new ExcludeFileOrFolderTool(mockClient);
  setup(async () => {
    // clear exclusion settings
    await vscode.workspace.getConfiguration(SONARLINT_CATEGORY).update('analysisExcludesStandalone', undefined);
    toolCalledCount.success = 0;
    toolCalledCount.failure = 0;
  });

  teardown(async () => {
    // Reset the configuration after tests
    await vscode.workspace.getConfiguration(SONARLINT_CATEGORY).update('analysisExcludesStandalone', undefined);
    toolCalledCount.success = 0;
    toolCalledCount.failure = 0;
  });

  test('Should prepare invocation with confirmation', async () => {
    const confirmation = await underTest.prepareInvocation(
      { input: { globPattern: '**/myTestFolder/**' } }, // options
      new vscode.CancellationTokenSource().token // token
    );
    assert.strictEqual(confirmation.invocationMessage, 'Updating SonarQube for IDE local analysis configuration...');
    assert.strictEqual(confirmation.confirmationMessages.title, 'Exclude files from local analysis');
    assert.strictEqual(
      confirmation.confirmationMessages.message.value,
      'Update SonarQube for IDE analysis settings to exclude ****/myTestFolder/****?'
    );
  });

  test('Should exclude requested file when not bound', async () => {
    const result = await underTest.invoke(
      { toolInvocationToken: undefined, input: { globPattern: '**/myTestFolder/**' } }, // options
      new vscode.CancellationTokenSource().token // token
    );
    assert.strictEqual(toolCalledCount.success, 1);

    const newExclusionSettings = vscode.workspace
      .getConfiguration(SONARLINT_CATEGORY)
      .get<string>('analysisExcludesStandalone');
    assert.strictEqual(newExclusionSettings, '**/myTestFolder/**');
    assert.strictEqual(result.content.length, 2);
    assert.strictEqual(
      (result.content[0] as vscode.LanguageModelTextPart).value,
      `SonarQube analysis configuration updated to exclude files matching the pattern: '**/myTestFolder/**'.
         Note that this change will only apply in case the folder is not bound to a remote project on SonarQube (Cloud, Server).`
    );
    assert.strictEqual(
      (result.content[1] as vscode.LanguageModelTextPart).value,
      'You can check the configured local exclusions in `SonarLint.analysisExcludesStandalone` setting.'
    );
  });

  test('Should throw error when bound', async () => {
    const workspaceFolder = vscode.workspace.workspaceFolders[0];

    // Set up the workspace folder to be bound
    await vscode.workspace
      .getConfiguration(SONARLINT_CATEGORY)
      .update(CONNECTED_MODE_SETTINGS_SONARQUBE, [TEST_SONARQUBE_CONNECTION], vscode.ConfigurationTarget.Global);

    await vscode.workspace
      .getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri)
      .update(BINDING_SETTINGS, TEST_BINDING);

    // Open file inside the bound workspace folder
    const fileUri = vscode.Uri.file(workspaceFolder.uri.fsPath + '/sample.py');
    await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(fileUri);

    underTest
      .invoke(
        { toolInvocationToken: undefined, input: { globPattern: '**/myTestFolder/**' } }, // options
        new vscode.CancellationTokenSource().token // token
      )
      .then(() => { throw new Error('was not supposed to succeed') })
      .catch((error: Error) => {
        assert.strictEqual(
          error.message,
          `The workspace folder '${workspaceFolder.name}' is bound to a remote project on SonarQube (Cloud, Server).
         Locally configured exclusions will not make a difference.`
        );
      });

    // clean up
    await vscode.workspace
      .getConfiguration(SONARLINT_CATEGORY)
      .update(CONNECTED_MODE_SETTINGS_SONARQUBE, [], vscode.ConfigurationTarget.Global);

    await vscode.workspace
      .getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri)
      .update(BINDING_SETTINGS, undefined);
  });
});
