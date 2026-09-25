/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import { glob } from 'glob';
import * as mochaNs from 'mocha';
import * as path from 'node:path';

const Mocha = ('default' in mochaNs ? mochaNs.default : mochaNs) as new (
  options?: Mocha.MochaOptions
) => Mocha;

export function runMochaSuite(xmlFileName: string) {
  return (testsRoot: string, cb: (error: any, failures?: number) => void): void => {
    const mocha = new Mocha({
      ui: 'tdd',
      reporter: 'mocha-multi-reporters',
      reporterOptions: {
        reporterEnabled: 'spec, xunit',
        xunitReporterOptions: {
          output: path.resolve(__dirname, '..', xmlFileName)
        }
      },
      color: true
    });

    glob('**/**.test.js', { cwd: testsRoot })
      .then(files => {
        files.forEach(file => mocha.addFile(path.resolve(testsRoot, file)));
        try {
          mocha.run(failures => cb(null, failures));
        } catch (err) {
          cb(err);
        }
      })
      .catch((err: Error) => cb(err));
  };
}
