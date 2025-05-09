/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
import { writeFileSync } from 'fs';
import { info } from 'fancy-log';
import { getPackageJSON } from './fsUtils.mjs';

export default function populateBuildNumber() {
  info('Starting task "populateBuildNumber');
  const buildNumber = process.env.BUILD_NUMBER;
  const packageJSON = getPackageJSON();
  packageJSON.buildNumber = buildNumber;
  writeFileSync('./package.json', JSON.stringify(packageJSON, null, 2));
};
