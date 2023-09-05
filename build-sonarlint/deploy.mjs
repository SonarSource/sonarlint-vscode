/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
import { deployUniversal, executeWithDurationLog } from './common.mjs';

(async () => {
  await executeWithDurationLog(
    async () => {
      await deployUniversal();
    }, 'Deploy-universal'
  );
})();
