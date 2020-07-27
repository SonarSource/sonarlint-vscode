/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2020 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as path from 'path';
import * as Mocha from 'mocha';
import * as glob from 'glob';

export function run(testsRoot: string, cb: (error: any, failures?: number) => void): void {
  // Create the mocha test
  const mocha = new Mocha({
    ui: 'tdd',
    reporter: 'mocha-multi-reporters',
    reporterOptions: {
      reporterEnabled: 'spec, xunit',
      xunitReporterOptions: {
        output: path.resolve(__dirname, '..', '..', 'java-tests.xml')
      }
    }
  });
  mocha.useColors(true);

  glob('**/**.test.js', { cwd: testsRoot }, (err, files) => {
    if (err) {
      return cb(err);
    }

    // Add files to the test suite
    files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

    try {
      // Run the mocha test
      mocha.run(failures => {
        return cb(null, failures);
      });
    } catch (runErr) {
      return cb(runErr);
    }
  });
}
