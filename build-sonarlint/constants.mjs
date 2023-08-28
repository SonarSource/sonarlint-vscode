/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
const constants = {};

Object.defineProperty(constants, 'UNIVERSAL_PLATFORM', {
  value: 'universal',
  writable: false
});

Object.defineProperty(constants, 'LATEST_JRE', {
  value: 17,
  writable: false
});

Object.defineProperty(constants, 'TARGETED_PLATFORMS', {
  value: ['win32-x64', 'linux-x64', 'darwin-x64', 'darwin-arm64'],
  writable: false
});

export default constants;
