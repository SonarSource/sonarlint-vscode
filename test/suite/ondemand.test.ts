/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { expect } from 'chai';
import * as fs from 'fs';
import { DateTime } from 'luxon';
import * as path from 'path';

import { cleanupOldAnalyzersAsync } from '../../src/cfamily/ondemand';
import * as util from '../../src/util/util';

suite('On demand analyzer download and cleanup', () => {

  const cFamily660LastUsed = 'plugins[sonar-cfamily-plugin][6.60.0.76379].lastUsed';
  const cFamily662LastUsed = 'plugins[sonar-cfamily-plugin][6.62.0.78645].lastUsed';

  const onDemandAnalyzersPath = path.resolve(util.extensionPath, '..', 'sonarsource.sonarlint_ondemand-analyzers');
  const cFamily660PluginFolder = path.resolve(onDemandAnalyzersPath, 'sonar-cfamily-plugin', '6.60.0.76379');
  const cFamily662PluginFolder = path.resolve(onDemandAnalyzersPath, 'sonar-cfamily-plugin', '6.62.0.78645');

  test('Should remove unused analyzers and keep ones still in use', async () => {

    // Creating a fake plugin 6.60 that was last used 3 months ago => will be cleaned
    fs.mkdirSync(cFamily660PluginFolder, { recursive: true });
    fs.writeFileSync(path.resolve(cFamily660PluginFolder, 'sonarcfamily.jar'), 'CFamily Analyzer 6.60!');
    await util.extensionContext.globalState.update(cFamily660LastUsed, DateTime.now().minus({ 'months': 3 }).toMillis());

    // Creating a fake plugin 6.62 that was last used 1 month ago => will be kept
    fs.mkdirSync(cFamily662PluginFolder, { recursive: true });
    fs.writeFileSync(path.resolve(cFamily662PluginFolder, 'sonarcfamily.jar'), 'CFamily Analyzer 6.62!');
    await util.extensionContext.globalState.update(cFamily662LastUsed, DateTime.now().minus({ 'months': 1 }).toMillis());

    await cleanupOldAnalyzersAsync();

    expect(fs.existsSync(cFamily660PluginFolder)).to.be.false;
    expect(fs.existsSync(cFamily662PluginFolder)).to.be.true;
  })

  teardown(async () => {
    fs.rmSync(onDemandAnalyzersPath, { recursive: true, force: true });
    util.extensionContext.globalState.update(cFamily660LastUsed, undefined);
    util.extensionContext.globalState.update(cFamily662LastUsed, undefined);
  });
});
