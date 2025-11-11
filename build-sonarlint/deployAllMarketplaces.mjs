/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
import { executeWithDurationLog, deployAll } from './common.mjs';
import { deployAllOpenVSX } from './deployAllOpenVSX.mjs';
import { deployBuildInfo } from './deployUtils.mjs';

// First deploy Microsoft marketplace variants (with OmniSharp in all packages)
await executeWithDurationLog(async () => {
  await deployAll();
}, 'Deploy-all-microsoft');

// Then deploy OpenVSX variants (without OmniSharp in platform-specific packages)
await executeWithDurationLog(async () => {
  await deployAllOpenVSX();
}, 'Deploy-all-openvsx');

// Finally, deploy build info with ALL artifacts (Microsoft + OpenVSX)
await executeWithDurationLog(async () => {
  await deployBuildInfo();
}, 'Deploy-build-info');


