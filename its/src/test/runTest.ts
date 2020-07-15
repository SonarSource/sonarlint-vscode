/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2020 SonarSource SA
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

		// run the integration test
		await runTests({
			// Use the specified `code` executable
			vscodeExecutablePath,
			extensionDevelopmentPath,
			extensionTestsPath
		});

        const javaExtensionTestsPath = path.resolve(__dirname, './javaSuite');
		const javaTestWorkspace = path.resolve(__dirname, '../../samples/workspace-java.code-workspace');

		cp.spawnSync(cliPath, ['--install-extension', 'redhat.java'], {
			encoding: 'utf-8',
			stdio: 'inherit'
		});

		await runTests({
			// Use the specified `code` executable
			vscodeExecutablePath,
			extensionDevelopmentPath,
			extensionTestsPath: javaExtensionTestsPath,
			launchArgs: [javaTestWorkspace]
		});

} catch (err) {
		console.error('Failed to run tests');
		process.exit(1);
	}
}

main();
