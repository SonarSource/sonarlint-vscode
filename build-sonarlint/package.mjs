/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
import { createVSIX } from 'vsce';
import { downloadOmnisharpAllPlatformDistributions } from './omnisharpDownload.mjs';
import { cleanOmnisharpDir } from './fsUtils.mjs';
import _default from './constants.mjs';

const { OMNISHARP_VERSION } = _default;

(async () => {
  await downloadOmnisharpAllPlatformDistributions(OMNISHARP_VERSION);
  await createVSIX();
  cleanOmnisharpDir();
})();
