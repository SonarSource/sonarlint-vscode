/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
import { getPackageJSON } from './fsUtils.mjs';
import { exec } from 'child_process';
import { info } from 'fancy-log';

export default function cycloneDx() {
  info('Starting task "cyclneDx"')
  const packageJSON = getPackageJSON();
  const version = packageJSON.version;
  const cycloneDxCommand = `npm run cyclonedx-run -- -d --output sonarlint-vscode-${version}.sbom-cyclonedx.json`;
  exec(cycloneDxCommand, (err, stdout, stderr) => {
    console.log(stdout);
    console.log(stderr);
  });
}

