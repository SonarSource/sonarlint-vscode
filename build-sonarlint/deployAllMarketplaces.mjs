/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
import { executeWithDurationLog } from './common.mjs';
import { deployAll } from './common.mjs';
import { deployAllOpenVSX } from './deployAllOpenVSX.mjs';

(async () => {
  // First deploy Microsoft marketplace variants (with OmniSharp in all packages)
  await executeWithDurationLog(async () => {
    await deployAll();
  }, 'Deploy-all-microsoft');

  // Then deploy OpenVSX variants (without OmniSharp in platform-specific packages)
  await executeWithDurationLog(async () => {
    await deployAllOpenVSX();
  }, 'Deploy-all-openvsx');
})();


