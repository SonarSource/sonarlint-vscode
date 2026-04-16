/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
import { deployAll, executeWithDurationLog } from './common.mjs';

(async () => {
  await executeWithDurationLog(async () => {
    await deployAll();
  }, 'Deploy-all');
})();
