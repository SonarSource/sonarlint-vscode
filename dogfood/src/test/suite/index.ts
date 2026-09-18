import { glob } from 'glob';
import * as mochaNs from 'mocha';
import * as path from 'path';

const Mocha = ('default' in mochaNs ? mochaNs.default : mochaNs) as typeof mochaNs;

export function run(): Promise<void> {
  const mocha = new Mocha({
    ui: 'tdd',
    color: true
  });

  const testsRoot = path.resolve(__dirname, '..');

  return new Promise((c, e) => {
    glob('**/**.test.js', { cwd: testsRoot }).then(files => {
      files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

      try {
        mocha.run(failures => {
          if (failures > 0) {
            e(new Error(`${failures} tests failed.`));
          } else {
            c();
          }
        });
      } catch (error) {
        console.error(error);
        e(error);
      }
    });
  });
}
