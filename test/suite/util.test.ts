/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { startedInDebugMode } from '../../src/util';
import { expect } from 'chai';

suite('util', () => {
  test('should detect --debug', () => {
    process.execArgv = ['param1', '--debug', 'param2'];
    expect(startedInDebugMode(process)).to.be.true;
  });

  test('should detect --debug-brk', () => {
    process.execArgv = ['param1', '--debug-brk', 'param2'];
    expect(startedInDebugMode(process)).to.be.true;
  });

  test('should detect --inspect-brk', () => {
    process.execArgv = ['param1', '--inspect-brk', 'param2'];
    expect(startedInDebugMode(process)).to.be.true;
  });

  test('should fail to detect arg', () => {
    process.execArgv = ['param1', 'param2'];
    expect(startedInDebugMode(process)).to.be.false;
  });

  test('should not have args', () => {
    process.execArgv = null;
    expect(startedInDebugMode(process)).to.be.false;
  });
});
