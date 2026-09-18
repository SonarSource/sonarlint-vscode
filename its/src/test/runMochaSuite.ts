/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import { glob } from 'glob';
import * as path from 'node:path';
import { loadMocha } from './loadMocha';

export function runMochaSuite(xmlFileName: string) {
  return (testsRoot: string, cb: (error: any, failures?: number) => void): void => {
    void (async () => {
      const Mocha = await loadMocha();
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

      const files = await glob('**/**.test.js', { cwd: testsRoot });
      files.forEach(file => mocha.addFile(path.resolve(testsRoot, file)));

      return await new Promise<number>((resolve, reject) => {
        try {
          mocha.run(failures => resolve(failures));
        } catch (err) {
          reject(err);
        }
      });
    })().then(
      failures => cb(null, failures),
      err => cb(err)
    );
  };
}
