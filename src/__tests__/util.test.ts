/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2019 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { startedInDebugMode } from '../util';

jest.mock('process');

describe('util', () => {

  describe('startedInDebugMode', () => {

    it('should detect --debug', () => {
      process.execArgv = ['param1', '--debug', 'param2'];
      expect(startedInDebugMode(process)).toBe(true);
    });

    it('should detect --debug-brk', () => {
      process.execArgv = ['param1', '--debug-brk', 'param2'];
      expect(startedInDebugMode(process)).toBe(true);
    });

    it('should detect --inspect-brk', () => {
      process.execArgv = ['param1', '--inspect-brk', 'param2'];
      expect(startedInDebugMode(process)).toBe(true);
    });

    it('should fail to detect arg', () => {
      process.execArgv = ['param1', 'param2'];
      expect(startedInDebugMode(process)).toBe(false);
    });

    it('should not have args', () => {
      process.execArgv = null;
      expect(startedInDebugMode(process)).toBe(false);
    });
  });
});
