/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
import { deployAll, executeWithDurationLog } from './common.mjs';
import { deployBuildInfo } from './deployUtils.mjs';

await executeWithDurationLog(async () => {
  await deployAll();
}, 'Deploy-all');

await executeWithDurationLog(async () => {
  await deployBuildInfo();
}, 'Deploy-build-info');
