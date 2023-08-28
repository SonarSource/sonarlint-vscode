/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
import _default from './constants.mjs'; 
const { TARGETED_PLATFORMS, LATEST_JRE } = _default;
import downloadJre from './jreDownload.mjs';
import { cleanJreDir } from './fsUtils.mjs';
import { createVSIX } from 'vsce';

(async () => {
  for (const platform of TARGETED_PLATFORMS) {
    await downloadJre(platform, LATEST_JRE);
    await createVSIX({ target: platform });
  }
  cleanJreDir();
  await createVSIX();
})();
