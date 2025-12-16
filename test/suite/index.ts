/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import { globby } from 'globby';
import * as Mocha from 'mocha';
import * as path from 'node:path';
import { createReport } from '../coverage';

export function run(): Promise<void> {
  // Create the mocha test
  const mochaOptions: Mocha.MochaOptions = {
    ui: 'tdd',
    reporter: 'mocha-multi-reporters',
    reporterOptions: {
      reporterEnabled: 'spec, xunit',
      xunitReporterOptions: {
        output: path.resolve(__dirname, '..', '..', 'alltests.xml')
      }
    },
    color: true,
    retries: 2
  };
  const mocha = new Mocha(mochaOptions);

  const testsRoot = path.resolve(__dirname, '..');

  return new Promise<void>((c, e) => {
    globby('**/**.test.js', { cwd: testsRoot }).then((files) => {
      // Add global before
      mocha.addFile(path.resolve(testsRoot, 'globalsetup.js'));

      // Add files to the test suite
      files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

      try {
        // Run the mocha test
        mocha.run(failures => {
          if (failures > 0) {
            e(new Error(`${failures} tests failed.`));
          } else {
            c();
          }
        });
      } catch (error) {
        e(error);
      }
    });
  }).then(async () => {
    // Tests have finished executing, check if we should generate a coverage report
    if (process.env['GENERATE_COVERAGE']) {
        await createReport();
    }
  }).catch((err: Error) => {
    throw new Error(`Failed to run tests: ${err.message}`);
  });
}
