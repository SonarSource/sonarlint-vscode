/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
import _default from './constants.mjs';
const { LATEST_JRE, OMNISHARP_VERSION, TARGETED_PLATFORMS } = _default;
import downloadJre from './jreDownload.mjs';
import { cleanJreDir } from './fsUtils.mjs';
import { createVSIX } from '@vscode/vsce';
import { downloadOmnisharpAllPlatformDistributions } from './omnisharpDownload.mjs';

// Build platform-specific packages WITHOUT OmniSharp
for (const platform of TARGETED_PLATFORMS) {
  await downloadJre(platform, LATEST_JRE);
  await createVSIX({ target: platform });
}
cleanJreDir();
// Build universal package WITH OmniSharp
await downloadOmnisharpAllPlatformDistributions(OMNISHARP_VERSION);
await createVSIX();
