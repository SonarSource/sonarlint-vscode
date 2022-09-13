/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { buildBaseServerUrl, getDisplayName, getServerType, startedInDebugMode, tokenizeString } from '../../src/util/util';
import { expect } from 'chai';

suite('util', () => {
  test('should detect --debug', () => {
    process.execArgv = ['param1', '--debug', 'param2'];
    expect(startedInDebugMode(process)).to.be.true;
  });

  test('should detect --debug-brk', () => {
    process.execArgv = ['param1', '--debug-brk', 'param2'];
    expect(startedInDebugMode(process)).to.be.true;
  });

  test('should detect --inspect-brk', () => {
    process.execArgv = ['param1', '--inspect-brk', 'param2'];
    expect(startedInDebugMode(process)).to.be.true;
  });

  test('should fail to detect arg', () => {
    process.execArgv = ['param1', 'param2'];
    expect(startedInDebugMode(process)).to.be.false;
  });

  test('should not have args', () => {
    process.execArgv = null;
    expect(startedInDebugMode(process)).to.be.false;
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
