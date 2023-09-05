/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as fs from 'fs';
import * as path from 'path';
import { runTests } from '@vscode/test-electron';
import { instrument } from './coverage';

const XVFB_DISPLAY = ':10';

function main() {
  const xDisplay = process.env['DISPLAY'];
  if (xDisplay) {
    console.log(`Using DISPLAY=${xDisplay}`);
  } else {
    console.warn(`No DISPLAY env variable found, exporting DISPLAY=${XVFB_DISPLAY}`);
    process.env['DISPLAY'] = XVFB_DISPLAY;
  }

  // The folder containing the Extension Manifest package.json
  // Passed to `--extensionDevelopmentPath`
  const extensionRootPath = path.resolve(__dirname, '../../');
  console.log('Extension root path: ' + extensionRootPath);
  const userDataDir = path.resolve(extensionRootPath, 'test', 'userdir');

  const launchArgs = [
    path.resolve(extensionRootPath, 'test/samples'),
    '--disable-extensions',
    '--disable-workspace-trust',
    `--user-data-dir=${userDataDir}`,
    '--password-store=basic'
  ];

  const packageJsonPath = path.resolve(extensionRootPath, 'package.json');
  const package_json = fs.readFileSync(packageJsonPath, 'utf8');
  const content = JSON.parse(package_json);

  const extensionDevelopmentPath = extensionRootPath;
  let outPath;
  if (process.argv.indexOf('--coverage') >= 0) {
    // Override main file path
    content.main = 'out-cov/src/extension';

    // generate instrumented files at out-cov
    instrument();

    // load the instrumented files
    outPath = path.resolve(extensionRootPath, 'out-cov');

    // signal that the coverage data should be gathered
    process.env['GENERATE_COVERAGE'] = '1';
  } else {
    // Override main file path
    content.main = 'out/src/extension';

    outPath = path.resolve(extensionRootPath, 'out');
  }
  fs.writeFileSync(packageJsonPath, JSON.stringify(content, null, 2), 'utf-8');

  // The path to the extension test runner script
  // Passed to --extensionTestsPath
  const extensionTestsPath = path.resolve(outPath, 'test/suite/index');

  // Download VS Code, unzip it and run the integration test
  runTests({ extensionDevelopmentPath, extensionTestsPath, launchArgs })
    .catch(err => {
      console.error('Failed to run tests', err);
      process.exit(1);
    })
    .then(() => process.exit(0));
}

main();
