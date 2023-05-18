/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { Context } from 'mocha';
import * as util from '../src/util/util';

export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function skipTestOnWindowsVm(testContext: Context, reason: string) {
  if (util.isRunningOnWindows() && util.isRunningAutoBuild()) {
    console.log(reason);
    testContext.skip();
  }
}

export function getWorkspaceFolder() {
  return {
    uri: {
      path: '/path1'
    },
    name: 'Name1',
    index: 0
  };
}
