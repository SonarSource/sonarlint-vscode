/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2021 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as cp from 'child_process';
import * as path from 'path';

import { downloadAndUnzipVSCode, resolveCliPathFromVSCodeExecutablePath, runTests } from 'vscode-test';
import { readdirSync } from 'fs';

const XVFB_DISPLAY = ':10';

async function main() {
  try {
    const xDisplay = process.env['DISPLAY'];
    if (xDisplay) {
      console.log(`Using DISPLAY=${xDisplay}`);
    } else {
      console.warn(`No DISPLAY env variable found, exporting DISPLAY=${XVFB_DISPLAY}`);
      process.env['DISPLAY'] = XVFB_DISPLAY;
    }

    const userDataDir = path.resolve(__dirname, '../../userdir');
    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');

    // The path to test runner
    // Passed to --extensionTestsPath
    const extensionTestsPath = path.resolve(__dirname, './suite');

    const vscodeVersion = process.env['VSCODE_VERSION'];
    const vscodeExecutablePath = await downloadAndUnzipVSCode(vscodeVersion);
    const cliPath = resolveCliPathFromVSCodeExecutablePath(vscodeExecutablePath);

    var vsixes = readdirSync('..').filter(fn => fn.endsWith('.vsix'));
    // Use cp.spawn / cp.exec for custom setup
    cp.spawnSync(cliPath, ['--install-extension', '../' + vsixes[0]], {
      encoding: 'utf-8',
      stdio: 'inherit'
    });

    const testErrors = [];

    // run the integration test
    try {
      await runTests({
        // Use the specified `code` executable
        vscodeExecutablePath,
        extensionDevelopmentPath,
        extensionTestsPath,
        launchArgs: [`--user-data-dir=${userDataDir}`]
      });
    } catch (testError) {
      testErrors.push(testError);
    }

    const pythonExtensionTestsPath = path.resolve(__dirname, './pythonSuite');
    const pythonTestWorkspace = path.resolve(__dirname, '../../samples/workspace-python.code-workspace');
    try {
      await runTests({
        // Use the specified `code` executable
        vscodeExecutablePath,
        extensionDevelopmentPath,
        extensionTestsPath: pythonExtensionTestsPath,
        launchArgs: [pythonTestWorkspace, `--user-data-dir=${userDataDir}`]
      });
    } catch (testError) {
      testErrors.push(testError);
    }

    const javaExtensionTestsPath = path.resolve(__dirname, './javaSuite');
    const javaTestWorkspace = path.resolve(__dirname, '../../samples/workspace-java.code-workspace');

    ['redhat.java', 'vscjava.vscode-maven'].forEach(requiredExtensionId => {
      cp.spawnSync(cliPath, ['--install-extension', requiredExtensionId], {
        encoding: 'utf-8',
        stdio: 'inherit'
      });
    });

    try {
      await runTests({
        // Use the specified `code` executable
        vscodeExecutablePath,
        extensionDevelopmentPath,
        extensionTestsPath: javaExtensionTestsPath,
        launchArgs: [javaTestWorkspace, `--user-data-dir=${userDataDir}`]
      });
    } catch (testError) {
      testErrors.push(testError);
    }

    if (testErrors.length > 0) {
      throw new Error('At least one test suite failed, please check logs above for actual failure.');
    }
  } catch (err) {
    console.error('Failed to run tests', err);
    process.exit(1);
  }
}

main();
