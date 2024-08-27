/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2024 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { logToSonarLintOutput } from '../src/util/logging';
import { extension } from '../src/util/util';

const ONE_MINUTE = 60_000;

setup('ensure extension is ready', async function () {
  logToSonarLintOutput(`>>>>>>>>>> Start  ${this.currentTest?.fullTitle()}`);
  this.timeout(ONE_MINUTE);
  await extension?.activate();
});

teardown(function() {
  logToSonarLintOutput(`<<<<<<<<<< Finish ${this.currentTest?.fullTitle()}`);
});
