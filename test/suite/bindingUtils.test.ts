/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { expect } from 'chai';
import { buildProjectOverviewBaseServerUrl } from '../../src/util/bindingUtils';

suite('Binding Utils Test Suite', () => {

  test('should build base server url', () => {
    const sqBaseServerUrl = buildProjectOverviewBaseServerUrl('SonarQube', 'serverUrl');
    const scBaseServerUrl = buildProjectOverviewBaseServerUrl('SonarCloud', 'orgKey');
    const scBaseServerUrlUS = buildProjectOverviewBaseServerUrl('SonarCloud', 'orgKey', 'US');

    expect(sqBaseServerUrl).to.be.equal('serverUrl/dashboard');
    expect(scBaseServerUrl).to.be.equal('https://sonarcloud.io/project/overview');
    expect(scBaseServerUrlUS).to.be.equal('https://sonarqube.us/project/overview');
  });
});
