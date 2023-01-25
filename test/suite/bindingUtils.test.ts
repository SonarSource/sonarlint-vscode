/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { ServerProject } from '../../src/connected/binding';
import { BaseConnection } from '../../src/settings/connectionsettings';

import * as VSCode from 'vscode';

import { expect } from 'chai';
import {
  buildBaseServerUrl,
  getBestHitsForConnections,
  getDisplayName,
  getServerType,
  tokenizeString
} from '../../src/util/bindingUtils';

suite('Binding Utils Test Suite', () => {
  test('should return zero hits if nothing found', async () => {
    const myFolder = {
      uri: VSCode.Uri.file('/'),
      name: 'my-folder-name',
      index: 0
    } as VSCode.WorkspaceFolder;
    const connectionToProjects = new Map<BaseConnection, ServerProject[]>();
    const sqConnection = { id: 'CONNECTION_ONE', serverType: 'SonarQube' } as BaseConnection;
    connectionToProjects.set(sqConnection, [{ key: 'project1', name: 'project' }]);

    const connectionToBestHits = getBestHitsForConnections(connectionToProjects, myFolder);

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
    connectionToProjects.set(sqConnection, [
      { key: 'project1', name: 'My Name' },
      {
        key: 'project2',
        name: 'My Name'
      }
    ]);

    const connectionToBestHits = getBestHitsForConnections(connectionToProjects, myFolder);

    expect(connectionToBestHits.get(sqConnection)).to.be.deep.equal([
      {
        hits: 2,
        projectKey: 'project1',
        projectName: 'My Name',
        connection: {
          id: 'CONNECTION_ONE',
          serverType: 'SonarQube'
        }
      },
      {
        hits: 2,
        projectKey: 'project2',
        projectName: 'My Name',
        connection: {
          id: 'CONNECTION_ONE',
          serverType: 'SonarQube'
        }
      }
    ]);
  });

  test("should return one hit if it's the single best one", async () => {
    const myFolder = {
      uri: VSCode.Uri.file('/'),
      name: 'my-folder-name',
      index: 0
    } as VSCode.WorkspaceFolder;
    const connectionToProjects = new Map<BaseConnection, ServerProject[]>();
    const sqConnection = { id: 'CONNECTION_ONE', serverType: 'SonarQube' } as BaseConnection;
    connectionToProjects.set(sqConnection, [
      { key: 'project1', name: 'My Folder Name' },
      {
        key: 'project2',
        name: 'My Name'
      }
    ]);

    const connectionToBestHits = getBestHitsForConnections(connectionToProjects, myFolder);

    expect(connectionToBestHits.get(sqConnection)).to.be.deep.equal([
      {
        hits: 3,
        projectKey: 'project1',
        projectName: 'My Folder Name',
        connection: {
          id: 'CONNECTION_ONE',
          serverType: 'SonarQube'
        }
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
    connectionToProjects.set(sqConnection, [
      { key: 'key1', name: 'My Folder Name' },
      {
        key: 'key2',
        name: 'SonarQube My Project Name'
      }
    ]);
    connectionToProjects.set(scConnection, [
      { key: 'key1', name: 'My Folder Name' },
      {
        key: 'key2',
        name: 'SonarCloud My Project Name'
      }
    ]);

    const connectionToBestHits = getBestHitsForConnections(connectionToProjects, myFolder);

    expect(connectionToBestHits.get(sqConnection)).to.be.deep.equal([
      {
        hits: 3,
        projectKey: 'key2',
        projectName: 'SonarQube My Project Name',
        connection: {
          id: 'CONNECTION_ONE',
          serverType: 'SonarQube'
        }
      }
    ]);
    expect(connectionToBestHits.get(scConnection)).to.be.deep.equal([
      {
        hits: 3,
        projectKey: 'key2',
        projectName: 'SonarCloud My Project Name',
        connection: {
          id: 'CONNECTION_TWO',
          serverType: 'SonarCloud'
        }
      }
    ]);
  });

  test('should tokenize string', () => {
    const tokens = tokenizeString('FoO:Bar.baz-foo bar');
    expect(tokens).to.be.deep.equal(['foo', 'bar', 'baz', 'foo', 'bar']);
  });

  test('should get server type', () => {
    const sqConnection = { connectionId: 'sqConnection', serverUrl: 'serverUrl' };
    const scConnection = { connectionId: 'sqConnection', organizationKey: 'organizationKey' };
    const sqServerType = getServerType(sqConnection);
    const scServerType = getServerType(scConnection);

    expect(sqServerType).to.be.equal('SonarQube');
    expect(scServerType).to.be.equal('SonarCloud');
  });

  test('should get display name', () => {
    const defaultSqConnection = { token: '', serverUrl: 'serverUrl' };
    const defaultScConnection = { token: '', organizationKey: 'organizationKey' };
    const connectionWithId = { connectionId: 'connectionId', serverUrl: 'serverUrl' };
    const connectionId = getDisplayName(connectionWithId);
    const serverUrl = getDisplayName(defaultSqConnection);
    const orgKey = getDisplayName(defaultScConnection);

    expect(connectionId).to.be.equal('connectionId');
    expect(serverUrl).to.be.equal('serverUrl');
    expect(orgKey).to.be.equal('organizationKey');
  });

  test('should build base server url', () => {
    const sqBaseServerUrl = buildBaseServerUrl('SonarQube', 'serverUrl');
    const scBaseServerUrl = buildBaseServerUrl('SonarCloud', 'orgKey');

    expect(sqBaseServerUrl).to.be.equal('serverUrl/dashboard');
    expect(scBaseServerUrl).to.be.equal('https://sonarcloud.io/project/overview');
  });
});
