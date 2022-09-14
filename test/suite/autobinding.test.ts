/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { BindingService, ServerProject } from '../../src/connected/binding';
import {
  BaseConnection,
  ConnectionSettingsService,
  SonarCloudConnection,
  SonarQubeConnection
} from '../../src/settings/connectionsettings';

import * as path from 'path';
import * as VSCode from 'vscode';

import { expect } from 'chai';
import { AutoBindingService, DO_NOT_ASK_ABOUT_AUTO_BINDING_FOR_WS_FLAG } from '../../src/connected/autobinding';
import { TextEncoder } from 'util';


const CONNECTED_MODE_SETTINGS_SONARQUBE = 'connectedMode.connections.sonarqube';
const SONARLINT_CATEGORY = 'sonarlint';
const BINDING_SETTINGS = 'connectedMode.project';
const TEST_PROJECT_KEY = 'org.sonarsource.sonarlint.vscode:test-project';
const TEST_ORGANISATION = 'test';

const TEST_SONARQUBE_CONNECTION = {
  connectionId: 'test',
  serverUrl: 'https://test.sonarqube.com'
};

const mockSettingsService = {
  async loadSonarQubeConnection(connectionId: string): Promise<SonarQubeConnection> {
    return { serverUrl: 'https://next.sonarqube.com/sonarqube', connectionId: connectionId };
  }, getSonarQubeConnections(): SonarQubeConnection[] {
    return [{
      connectionId: 'SQconnectionId',
      disableNotifications: true,
      serverUrl: 'serverUrl'
    }];
  }, getSonarCloudConnections(): SonarCloudConnection[] {
    return [{
      connectionId: 'SCconnectionId',
      disableNotifications: true,
      organizationKey: 'organizationKey'
    }]
  }


} as ConnectionSettingsService;

const mockBindingService = {
  async getConnectionToServerProjects(_scConnections: SonarCloudConnection[],
                                      _sqConnections: SonarQubeConnection[]):
    Promise<Map<BaseConnection, ServerProject[]>> {
    const projects = new Map<BaseConnection, ServerProject[]>();
    projects.set({ connectionId: 'connectionId' },
      [{ key: 'projectkey1', name: 'projectName1' },
        { key: 'projectkey2', name: 'projectName2' },
        { key: 'sample', name: 'Sample' }]);
    return projects;
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

suite('Auto Binding Test Suite', () => {
  let underTest;
  setup(async () => {
    underTest = new AutoBindingService(mockBindingService, mockWorkspaceState, mockSettingsService);
    // start from 1 SQ connection config
    await VSCode.workspace
      .getConfiguration(SONARLINT_CATEGORY)
      .update(CONNECTED_MODE_SETTINGS_SONARQUBE, [TEST_SONARQUBE_CONNECTION], VSCode.ConfigurationTarget.Global);

    await cleanBindings();
  });

  teardown(async () => {
    await cleanBindings();
    await VSCode.commands.executeCommand('workbench.action.closeAllEditors');
    await mockWorkspaceState.update(DO_NOT_ASK_ABOUT_AUTO_BINDING_FOR_WS_FLAG, false);
  });

  suite('Bindings Manager', () => {
    let underTest;
    setup(() => {
      underTest = new AutoBindingService(mockBindingService, mockWorkspaceState, mockSettingsService);
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
      const workspaceFolder = VSCode.workspace.workspaceFolders[0];

      let bindingBefore = VSCode.workspace
        .getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri)
        .get(BINDING_SETTINGS);
      expect(bindingBefore).to.be.empty;

      mockWorkspaceState.update(DO_NOT_ASK_ABOUT_AUTO_BINDING_FOR_WS_FLAG, true);

      underTest.checkConditionsAndAttemptAutobinding();

      let bindingAfter = VSCode.workspace
        .getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri)
        .get(BINDING_SETTINGS);
      expect(bindingAfter).to.be.empty;
    });

    test('Analysis settings file is properly found when it exists', async () => {
      const workspaceFolder1 = VSCode.workspace.workspaceFolders[0];

      const fileUri = VSCode.Uri.file(path.join(workspaceFolder1.uri.path, 'sonar-project.properties'));

      await VSCode.workspace.fs.writeFile(
        fileUri,
        new TextEncoder().encode(`sonar.host.url=https://test.sonarqube.com
      sonar.projectKey=org.sonarsource.sonarlint.vscode:test-project`)
      );

      const p = await underTest.getAnalysisSettingsFile(workspaceFolder1);

      expect(p[0]).to.equal('sonar-project.properties');

      await VSCode.workspace.fs.delete(fileUri);
    });

    test('Nothing crashes when analysis file is not present', async () => {
      const workspaceFolder1 = VSCode.workspace.workspaceFolders[0];

      const p = await underTest.getAnalysisSettingsFile(workspaceFolder1);

      expect(p).to.be.undefined;
    });

    test('SQ analysis settings file is properly parsed', async () => {
      const workspaceFolder1 = VSCode.workspace.workspaceFolders[0];
      const fileUri = VSCode.Uri.file(path.join(workspaceFolder1.uri.path, 'sonar-project.properties'));

      await VSCode.workspace.fs.writeFile(
        fileUri,
        new TextEncoder().encode(`sonar.host.url=https://test.sonarqube.com
      sonar.projectKey=org.sonarsource.sonarlint.vscode:test-project`)
      );

      const p = await underTest.getAnalysisSettingsFile(workspaceFolder1);

      const { serverUrl, projectKey, organization } = await underTest.parseAnalysisSettings(p[0], workspaceFolder1);

      expect(serverUrl).to.equal(TEST_SONARQUBE_CONNECTION.serverUrl);
      expect(projectKey).to.equal(TEST_PROJECT_KEY);
      expect(organization).to.be.undefined;

      await VSCode.workspace.fs.delete(fileUri);
    });

    test('SC analysis settings file is properly parsed', async () => {
      const workspaceFolder1 = VSCode.workspace.workspaceFolders[0];

      const fileUri = VSCode.Uri.file(path.join(workspaceFolder1.uri.path, '.sonarcloud.properties'));
      await VSCode.workspace.fs.writeFile(
        fileUri,
        new TextEncoder().encode(`sonar.organization=test
      sonar.projectKey=org.sonarsource.sonarlint.vscode:test-project`)
      );

      const p = await underTest.getAnalysisSettingsFile(workspaceFolder1);

      const { serverUrl, projectKey, organization } = await underTest.parseAnalysisSettings(p[0], workspaceFolder1);

      expect(serverUrl).to.be.undefined;
      expect(projectKey).to.equal(TEST_PROJECT_KEY);
      expect(organization).to.equal(TEST_ORGANISATION);

      await VSCode.workspace.fs.delete(fileUri);
    });
  });

  test('should return zero hits if nothing found', async () => {
    const myFolder = {
      uri: VSCode.Uri.file('/'),
      name: 'my-folder-name',
      index: 0
    } as VSCode.WorkspaceFolder;
    const connectionToProjects = new Map<BaseConnection, ServerProject[]>();
    const sqConnection = { id: 'CONNECTION_ONE', serverType: 'SonarQube' } as BaseConnection;
    connectionToProjects.set(sqConnection, [{ key: 'project1', name: 'project' }]);

    const connectionToBestHits = await underTest.getBestHitsForConnections(connectionToProjects, myFolder);

    expect(connectionToBestHits.size).to.be.equal(0);
  });

  test('should return many hits if they are equally good', async () => {
    const myFolder = {
      uri: VSCode.Uri.file('/'),
      name: 'my-folder-name',
      index: 0
    } as VSCode.WorkspaceFolder;
    const connectionToProjects = new Map<BaseConnection, ServerProject[]>();
    const sqConnection = { id: 'CONNECTION_ONE', serverType: 'SonarQube' } as BaseConnection;
    connectionToProjects.set(sqConnection, [{ key: 'project1', name: 'My Name' }, {
      key: 'project2',
      name: 'My Name'
    }]);

    const connectionToBestHits = await underTest.getBestHitsForConnections(connectionToProjects, myFolder);

    expect(connectionToBestHits.get(sqConnection)).to.be.deep.equal([
      {
        hits: 2,
        projectKey: "project1",
        connection: {
          id: "CONNECTION_ONE",
          serverType: "SonarQube",
        },
      },
      {
        hits: 2,
        projectKey: "project2",
        connection: {
          id: "CONNECTION_ONE",
          serverType: "SonarQube",
        },
      }
    ]);
  });

  test('should return one hit if it\'s the single best one', async () => {
    const myFolder = {
      uri: VSCode.Uri.file('/'),
      name: 'my-folder-name',
      index: 0
    } as VSCode.WorkspaceFolder;
    const connectionToProjects = new Map<BaseConnection, ServerProject[]>();
    const sqConnection = { id: 'CONNECTION_ONE', serverType: 'SonarQube' } as BaseConnection;
    connectionToProjects.set(sqConnection, [{ key: 'project1', name: 'My Folder Name' }, {
      key: 'project2',
      name: 'My Name'
    }]);

    const connectionToBestHits = await underTest.getBestHitsForConnections(connectionToProjects, myFolder);

    expect(connectionToBestHits.get(sqConnection)).to.be.deep.equal([
      {
        hits: 3,
        projectKey: "project1",
        connection: {
          id: "CONNECTION_ONE",
          serverType: "SonarQube",
        },
      }
    ]);
  });

  test('should return best hits for many connections and server types', async () => {
    const myFolder = {
      uri: VSCode.Uri.file('/'),
      name: 'my-project-name',
      index: 0
    } as VSCode.WorkspaceFolder;
    const connectionToProjects = new Map<BaseConnection, ServerProject[]>();
    const sqConnection = { id: 'CONNECTION_ONE', serverType: 'SonarQube' } as BaseConnection;
    const scConnection = { id: 'CONNECTION_TWO', serverType: 'SonarCloud' } as BaseConnection;
    connectionToProjects.set(sqConnection, [{ key: 'key1', name: 'My Folder Name' }, {
      key: 'key2',
      name: 'SonarQube My Project Name'
    }]);
    connectionToProjects.set(scConnection, [{ key: 'key1', name: 'My Folder Name' }, {
      key: 'key2',
      name: 'SonarCloud My Project Name'
    }]);

    const connectionToBestHits = await underTest.getBestHitsForConnections(connectionToProjects, myFolder);

    expect(connectionToBestHits.get(sqConnection)).to.be.deep.equal([
      {
        hits: 3,
        projectKey: "key2",
        connection: {
          id: "CONNECTION_ONE",
          serverType: "SonarQube",
        },
      }
    ]);
    expect(connectionToBestHits.get(scConnection)).to.be.deep.equal([
      {
        hits: 3,
        projectKey: "key2",
        connection: {
          id: "CONNECTION_TWO",
          serverType: "SonarCloud",
        },
      }
    ]);
  });

});

async function cleanBindings() {
  return Promise.all(VSCode.workspace.workspaceFolders.map(folder => {
    return VSCode.workspace.getConfiguration(SONARLINT_CATEGORY, folder.uri)
      .update(BINDING_SETTINGS, undefined, VSCode.ConfigurationTarget.WorkspaceFolder);
  }));
}
