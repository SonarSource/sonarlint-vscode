/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as fs from 'fs';
import * as path from 'path';
import * as util from '../util/util';

export function maybeAddCFamilyJar(params: string[]) {
  const cFamilyDependency = util.packageJson.jarDependencies.filter(dep => dep.artifactId === 'sonar-cfamily-plugin')[0];
  const onDemandAnalyzersPath = path.resolve(util.extensionPath, '..', 'sonarsource.sonarlint_ondemand-analyzers');
  const maybeCFamilyJar = path.resolve(onDemandAnalyzersPath, cFamilyDependency.version, 'sonarcfamily.jar');
  if (fs.existsSync(maybeCFamilyJar)) {
    params.push(maybeCFamilyJar);
  } else {
    // TODO Handle download asynchronously, check "don't ask again" flag, etc.
    console.warn('Not adding CFamily analyzer, not present on disk');
  }
}
