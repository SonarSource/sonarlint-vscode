/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2019 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as path from 'path';
import * as fs from 'fs';
import { instrument } from './coverage';
import { runTests } from 'vscode-test';

async function main() {
  try {
    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionRootPath = path.resolve(__dirname, '../../');
    console.log('Extension root path: ' + extensionRootPath);

    const launchArgs = [path.resolve(extensionRootPath, 'test/samples')];

    const packageJsonPath = path.resolve(extensionRootPath, 'package.json');
    const package_json = fs.readFileSync(packageJsonPath, 'utf8');
    var content = JSON.parse(package_json);

    const extensionDevelopmentPath = extensionRootPath;
    var outPath;
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
    await runTests({ extensionDevelopmentPath, extensionTestsPath, launchArgs })
    process.exit(0);
  } catch (err) {
    console.error('Failed to run tests', err);
    process.exit(1);
  }
}

main();
