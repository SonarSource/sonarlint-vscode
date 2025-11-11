/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
import { deployUniversal, executeWithDurationLog } from './common.mjs';

await executeWithDurationLog(
  async () => {
    await deployUniversal();
  }, 'Deploy-universal'
);
