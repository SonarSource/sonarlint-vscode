/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { expect } from 'chai';
import {
  describeMissingConnection,
  missingConnectionOf,
  sonarCloudFormValuesOf,
  sonarQubeFormValuesOf
} from '../../src/connected/missingConnection';
import { ExtendedServer } from '../../src/lsp/protocol';

const unresolved: ExtendedServer.BindingInfo = {
  scopeUri: 'file:///ws/moduleB',
  name: 'moduleB',
  relativePath: 'moduleB',
  projectKey: 'module-b',
  source: 'SONAR_CONFIG',
  status: 'MISSING_CONNECTION'
};

suite('Missing connection of an unresolved binding', () => {
  test('should be a SonarQube Server connection to the URL of the config', () => {
    expect(missingConnectionOf({ ...unresolved, serverUrl: 'https://sonar.example.com' })).to.deep.equal({
      kind: 'sonarqube',
      serverUrl: 'https://sonar.example.com',
      connectionId: ''
    });
  });

  test('should be a SonarQube Cloud connection to the organization and region of the config', () => {
    expect(missingConnectionOf({ ...unresolved, organization: 'my-org', region: 'US' })).to.deep.equal({
      kind: 'sonarcloud',
      organization: 'my-org',
      region: 'US',
      connectionId: ''
    });
  });

  test('should default to the EU region', () => {
    expect(missingConnectionOf({ ...unresolved, organization: 'my-org' })).to.deep.equal({
      kind: 'sonarcloud',
      organization: 'my-org',
      region: 'EU',
      connectionId: ''
    });
  });

  test('should only know the connection id when the binding comes from the folder settings', () => {
    expect(missingConnectionOf({ ...unresolved, source: 'SETTINGS', connectionId: 'my-connection' })).to.deep.equal({
      kind: 'unknown',
      connectionId: 'my-connection'
    });
  });

  test('should keep the connection id whatever the type of the connection', () => {
    expect(missingConnectionOf({ ...unresolved, connectionId: 'my-connection', serverUrl: 'https://sonar.example.com' })).to.deep.equal({
      kind: 'sonarqube',
      serverUrl: 'https://sonar.example.com',
      connectionId: 'my-connection'
    });
  });
});

suite('Description of a missing connection', () => {
  test('should name the SonarQube Server URL', () => {
    expect(describeMissingConnection({ ...unresolved, serverUrl: 'https://sonar.example.com' })).to.equal(
      'SonarQube Server https://sonar.example.com'
    );
  });

  test('should name the SonarQube Cloud organization and region', () => {
    expect(describeMissingConnection({ ...unresolved, organization: 'my-org', region: 'US' })).to.equal(
      "SonarQube Cloud organization 'my-org' (US)"
    );
    expect(describeMissingConnection({ ...unresolved, organization: 'my-org' })).to.equal("SonarQube Cloud organization 'my-org' (EU)");
  });

  test('should name the connection of the folder settings', () => {
    expect(describeMissingConnection({ ...unresolved, source: 'SETTINGS', connectionId: 'my-connection' })).to.equal(
      "connection 'my-connection'"
    );
  });

  test('should say so when nothing is known', () => {
    expect(describeMissingConnection(unresolved)).to.equal('a connection');
  });
});

suite('Values the connection forms start with', () => {
  const server = { binding: { ...unresolved, serverUrl: 'https://sonar.example.com' } };
  const cloud = { binding: { ...unresolved, organization: 'my-org', region: 'US' } };
  const fromSettings = { binding: { ...unresolved, source: 'SETTINGS' as const, connectionId: 'my-connection' } };

  test('should be empty when the command is not run from an unresolved binding', () => {
    expect(sonarQubeFormValuesOf(undefined)).to.deep.equal({ serverUrl: '', connectionId: '' });
    expect(sonarCloudFormValuesOf(undefined)).to.deep.equal({ organization: '', region: 'EU', connectionId: '' });
    expect(sonarQubeFormValuesOf({})).to.deep.equal({ serverUrl: '', connectionId: '' });
    expect(sonarCloudFormValuesOf({})).to.deep.equal({ organization: '', region: 'EU', connectionId: '' });
  });

  test('should hold the server URL of a config for the SonarQube Server form only', () => {
    expect(sonarQubeFormValuesOf(server)).to.deep.equal({ serverUrl: 'https://sonar.example.com', connectionId: '' });
    expect(sonarCloudFormValuesOf(server)).to.deep.equal({ organization: '', region: 'EU', connectionId: '' });
  });

  test('should hold the organization and region of a config for the SonarQube Cloud form only', () => {
    expect(sonarCloudFormValuesOf(cloud)).to.deep.equal({ organization: 'my-org', region: 'US', connectionId: '' });
    expect(sonarQubeFormValuesOf(cloud)).to.deep.equal({ serverUrl: '', connectionId: '' });
  });

  test('should hold the connection id of the folder settings in both forms', () => {
    expect(sonarQubeFormValuesOf(fromSettings)).to.deep.equal({ serverUrl: '', connectionId: 'my-connection' });
    expect(sonarCloudFormValuesOf(fromSettings)).to.deep.equal({ organization: '', region: 'EU', connectionId: 'my-connection' });
  });
});
