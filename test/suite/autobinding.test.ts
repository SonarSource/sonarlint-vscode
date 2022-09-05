/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { expect } from 'chai';
import { BindingService } from '../../src/connected/binding';
import { ConnectionSettingsService, SonarCloudConnection, SonarQubeConnection } from '../../src/settings/connectionsettings';

import * as VSCode from 'vscode';
import { AutoBindingService, DO_NOT_ASK_ABOUT_AUTO_BINDING_FLAG } from '../../src/connected/autobinding';

const CONNECTED_MODE_SETTINGS_SONARQUBE = 'connectedMode.connections.sonarqube';
const SONARLINT_CATEGORY = 'sonarlint';
const BINDING_SETTINGS = 'connectedMode.project';

const TEST_SONARQUBE_CONNECTION = {
  connectionId: 'test',
  serverUrl: 'https://test.sonarqube.com'
};

const DEFAULT_TEST_SONARQUBE_CONNECTION = {
  serverUrl: 'https://test.sonarqube.com'
};

const mockSettingsService = {
  async loadSonarQubeConnection(connectionId: string): Promise<SonarQubeConnection> {
    return { serverUrl: 'https://next.sonarqube.com/sonarqube', connectionId: connectionId };
  },
  getSonarQubeConnections(): SonarQubeConnection[] {
    return [TEST_SONARQUBE_CONNECTION, DEFAULT_TEST_SONARQUBE_CONNECTION];
  },

  getSonarCloudConnections(): SonarCloudConnection[] {
    return [];
  }
} as ConnectionSettingsService;

const mockBindingsService = {
  shouldBeAutoBound(_workspaceFolder: VSCode.WorkspaceFolder) {
    return true;
  }
} as BindingService;

const mockWorkspaceState = {
  state: false,
  keys: () => [],
  get(_identifier: string) {
    return this.state;
  },
  async update(_identifier: string, newState: boolean) {
    this.state = newState;
  }
};

async function resetBindings() {
  return Promise.all(
    VSCode.workspace.workspaceFolders.map(folder => {
      return VSCode.workspace
        .getConfiguration(SONARLINT_CATEGORY, folder.uri)
        .update(BINDING_SETTINGS, undefined, VSCode.ConfigurationTarget.WorkspaceFolder);
    })
  );
}

suite('Bindings Test Suite', () => {
  setup(async () => {
    // start from 1 SQ connection config
    await VSCode.workspace
      .getConfiguration(SONARLINT_CATEGORY)
      .update(CONNECTED_MODE_SETTINGS_SONARQUBE, [TEST_SONARQUBE_CONNECTION], VSCode.ConfigurationTarget.Global);

    await resetBindings();
  });

  teardown(async () => {
    await resetBindings();
    await VSCode.commands.executeCommand('workbench.action.closeAllEditors');
	await mockWorkspaceState.update(DO_NOT_ASK_ABOUT_AUTO_BINDING_FLAG, false);
  });

  suite('Bindings Manager', () => {
    let underTest;
    setup(() => {
      underTest = new AutoBindingService(mockBindingsService, mockWorkspaceState, mockSettingsService);
    });

    test('One unbound folder gets autobound', async () => {
      const workspaceFolder1 = VSCode.workspace.workspaceFolders[0];

      let bindingBefore = VSCode.workspace
        .getConfiguration(SONARLINT_CATEGORY, workspaceFolder1.uri)
        .get(BINDING_SETTINGS);
      expect(bindingBefore).to.be.empty;

      underTest.checkConditionsAndAttemptAutobinding();

      // TODO enable after actual implementation
      //   let bindingAfter = VSCode.workspace.getConfiguration(SONARLINT_CATEGORY, workspaceFolder1.uri).get(BINDING_SETTINGS);
      //   expect(bindingBefore).to.be.empty;
    });

    test(`No autobinding when user said "don't ask again"`, async () => {
      const workspaceFolder1 = VSCode.workspace.workspaceFolders[0];

      let bindingBefore = VSCode.workspace
        .getConfiguration(SONARLINT_CATEGORY, workspaceFolder1.uri)
        .get(BINDING_SETTINGS);
      expect(bindingBefore).to.be.empty;

      mockWorkspaceState.update(DO_NOT_ASK_ABOUT_AUTO_BINDING_FLAG, true);

      underTest.checkConditionsAndAttemptAutobinding();

      let bindingAfter = VSCode.workspace
        .getConfiguration(SONARLINT_CATEGORY, workspaceFolder1.uri)
        .get(BINDING_SETTINGS);
      expect(bindingAfter).to.be.empty;
    });
  });
});
