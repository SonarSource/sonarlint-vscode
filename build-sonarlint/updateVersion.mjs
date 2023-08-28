/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
import { writeFileSync } from 'fs';
import { info } from 'fancy-log';
import { getPackageJSON } from './fsUtils.mjs';

export default function updateVersion() {
  info('Starting task "updateVersion');
  const buildNumber = process.env.BUILD_NUMBER;
  const packageJSON = getPackageJSON();
  const version = packageJSON.version;
  if (version.endsWith('-SNAPSHOT') && buildNumber) {
    packageJSON.version = version.replace('-SNAPSHOT', `+${buildNumber}`);
    writeFileSync('./package.json', JSON.stringify(packageJSON));
  } else {
    info(`Not modifying version ${version} with build number ${buildNumber}`);
  }
};
