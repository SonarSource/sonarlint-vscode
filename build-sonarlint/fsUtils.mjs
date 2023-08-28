/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
import del from 'del';
import { info } from 'fancy-log';
import { pathExistsSync, removeSync } from 'fs-extra/esm';
import { readFileSync, unlinkSync } from 'fs';

export function clean() {
  info('Starting task "clean"');
  del(['*.vsix', 'server', 'out', 'out-cov']);
}

export function cleanJreDir() {
  if (pathExistsSync('./jre')) {
    removeSync('./jre');
  }
}

export function getPackageJSON() {
  return JSON.parse(readFileSync('package.json').toString());
}

export function deleteFile(filePath) {
  unlinkSync(filePath);
}

