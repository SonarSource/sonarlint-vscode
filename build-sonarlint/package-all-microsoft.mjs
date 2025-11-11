/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
import _default from './constants.mjs'; 
const { TARGETED_PLATFORMS, LATEST_JRE, OMNISHARP_VERSION } = _default;
import downloadJre from './jreDownload.mjs';
import { cleanJreDir, cleanOmnisharpDir } from './fsUtils.mjs';
import { createVSIX } from '@vscode/vsce';
import {
  downloadAndExtractOmnisharp,
  downloadOmnisharpAllPlatformDistributions,
  omnisharpPlatformMapping
} from './omnisharpDownload.mjs';

(async () => {
  for (const platform of TARGETED_PLATFORMS) {
    await downloadJre(platform, LATEST_JRE);
    await downloadAndExtractOmnisharp(OMNISHARP_VERSION, omnisharpPlatformMapping[platform]);
    await downloadAndExtractOmnisharp(OMNISHARP_VERSION, 'net6');
    await createVSIX({ target: platform });
    cleanOmnisharpDir();
  }
  cleanJreDir();
  await downloadOmnisharpAllPlatformDistributions(OMNISHARP_VERSION);
  await createVSIX();
})();
