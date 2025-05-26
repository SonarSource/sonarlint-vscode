/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import { SonarLintExtendedLanguageClient } from '../../../src/lsp/client';
import { assert, expect } from 'chai';
import { SONARLINT_CATEGORY } from '../../../src/settings/settings';
import * as sinon from 'sinon';
import { SetUpConnectedModeTool } from '../../../src/languageModelTools/setUpConnectedModeTool';
import { GetConnectionSuggestionsResponse } from '../../../src/lsp/protocol';
import * as connectionSetup from '../../../src/connected/connectionsetup';
import { Commands } from '../../../src/util/commands';

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

const fakeContext = {
  globalState: null,
  workspaceState: {
    get<T>(key: string): T | undefined {
      return null;
    }
  },
  subscriptions: null,
  extension: null
} as vscode.ExtensionContext;

const mockClient = {
  lmToolCalled: (name: string, success: boolean) => {
    // Mock implementation of the LMToolCalled method
    if (success) {
      toolCalledCount.success++;
    } else {
      toolCalledCount.failure++;
    }
    console.log(`Tool called: ${name}, Success: ${success}`);
  },

  getConnectionSuggestions: async (_workspaceFolder: string): Promise<GetConnectionSuggestionsResponse> => {
    return {
      connectionSuggestions: [
        {
          connectionSuggestion: {
            organization: 'myOrg',
            projectKey: 'myProject',
            region: 0
          },
          isFromSharedConfiguration: true
        }
      ]
    };
  }
} as SonarLintExtendedLanguageClient;

suite('Set up Connected Mode Language Model Tool Test Suite', () => {
  const underTest = new SetUpConnectedModeTool(fakeContext, mockClient);
  setup(async () => {
    toolCalledCount.success = 0;
    toolCalledCount.failure = 0;
    sinon.restore(); // Restore any previous stubs
  });

  test('Should prepare invocation with confirmation', async () => {
    const workspaceFolder = vscode.workspace.workspaceFolders[0];
    const confirmation = await underTest.prepareInvocation(
      {
        input: {
          isSonarQubeCloud: true,
          workspaceFolder: workspaceFolder.uri.path,
          organizationKey: 'testOrg',
          projectKey: 'testProject'
        }
      }, // options
      new vscode.CancellationTokenSource().token // token
    );
    assert.strictEqual(confirmation.invocationMessage, 'Computing Connection suggestions...');
    assert.strictEqual(confirmation.confirmationMessages.title, 'Set up Connected Mode');
    assert.strictEqual(
      confirmation.confirmationMessages.message.value,
      `Set up SonarQube Connected Mode for '**${workspaceFolder.uri.path}**' workspace folder?`
    );
  });

  test('Should trigger connection setup when neither connection nor binding exist', async () => {
    const workspaceFolder = vscode.workspace.workspaceFolders[0];

    const connectToSonarCloud = sinon.spy(connectionSetup, 'connectToSonarCloud');

    const result = await underTest.invoke(
      {
        toolInvocationToken: undefined,
        input: {
          isSonarQubeCloud: true,
          workspaceFolder: workspaceFolder.uri.path,
          organizationKey: 'testOrg',
          projectKey: 'testProject'
        }
      }, // options
      new vscode.CancellationTokenSource().token // token
    );

    expect(connectToSonarCloud.calledOnce).to.be.true;
    expect(toolCalledCount.success).to.equal(1);
    expect(result.content.length).to.equal(2);
    assert.strictEqual((result.content[0] as vscode.LanguageModelTextPart).value, 'Connected Mode setup started...');
    assert.strictEqual(
      (result.content[1] as vscode.LanguageModelTextPart).value,
      'Please follow the instructions on the screen.'
    );

    sinon.restore();
  });

  test('Should return informative message when folder is already bound', async () => {
    const workspaceFolder = vscode.workspace.workspaceFolders[0];
    // Set up the workspace folder to be bound
    await vscode.workspace
      .getConfiguration(SONARLINT_CATEGORY)
      .update(CONNECTED_MODE_SETTINGS_SONARQUBE, [TEST_SONARQUBE_CONNECTION], vscode.ConfigurationTarget.Global);

    await vscode.workspace
      .getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri)
      .update(BINDING_SETTINGS, TEST_BINDING);

    const result = await underTest.invoke(
      {
        toolInvocationToken: undefined,
        input: {
          isSonarQubeCloud: true,
          workspaceFolder: workspaceFolder.uri.path,
          organizationKey: 'testOrg',
          projectKey: 'testProject'
        }
      }, // options
      new vscode.CancellationTokenSource().token // token
    );

    assert.strictEqual(toolCalledCount.success, 1);
    assert.strictEqual(result.content.length, 1);
    assert.strictEqual(
      (result.content[0] as vscode.LanguageModelTextPart).value,
      `The workspace folder **${workspaceFolder.name}** is already bound to a remote project on SonarQube (Cloud, Server). Nothing more to do.`
    );

    // clean up
    await vscode.workspace
      .getConfiguration(SONARLINT_CATEGORY)
      .update(CONNECTED_MODE_SETTINGS_SONARQUBE, [], vscode.ConfigurationTarget.Global);

    await vscode.workspace
      .getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri)
      .update(BINDING_SETTINGS, undefined);
  });

  test('Should call auto-bind command when connection exists but no binding', async () => {
    const workspaceFolder = vscode.workspace.workspaceFolders[0];
    // Set up the workspace folder to have connection but no binding
    await vscode.workspace
      .getConfiguration(SONARLINT_CATEGORY)
      .update(CONNECTED_MODE_SETTINGS_SONARQUBE, [TEST_SONARQUBE_CONNECTION], vscode.ConfigurationTarget.Global);

    const executeCommand = sinon.spy(vscode.commands, 'executeCommand');

    const result = await underTest.invoke(
      {
        toolInvocationToken: undefined,
        input: {
          isSonarQubeCloud: true,
          workspaceFolder: workspaceFolder.uri.path,
          organizationKey: 'testOrg',
          projectKey: 'testProject'
        }
      }, // options
      new vscode.CancellationTokenSource().token // token
    );

    assert.strictEqual(toolCalledCount.success, 1);
    assert.strictEqual(result.content.length, 2);
    assert.strictEqual(
      (result.content[0] as vscode.LanguageModelTextPart).value,
      'Server connection already configured.'
    );
    assert.strictEqual(
      (result.content[1] as vscode.LanguageModelTextPart).value,
      'Initiated auto-binding of workspace folders to remote projects.'
    );
    assert(executeCommand.calledWith(Commands.AUTO_BIND_WORKSPACE_FOLDERS));

    // clean up
    await vscode.workspace
      .getConfiguration(SONARLINT_CATEGORY)
      .update(CONNECTED_MODE_SETTINGS_SONARQUBE, [], vscode.ConfigurationTarget.Global);

    await vscode.workspace
      .getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri)
      .update(BINDING_SETTINGS, undefined);

    sinon.restore();  
  });
});
