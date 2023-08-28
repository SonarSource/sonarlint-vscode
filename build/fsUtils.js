import del from 'del';
import fse from 'fs-extra';
import fs from 'fs';

export function clean() {
  del(['*.vsix', 'server', 'out', 'out-cov']);
}

export function cleanJreDir() {
  if (fse.existsSync('./jre')) {
    fse.removeSync('./jre');
  }
}

export function getPackageJSON() {
  return JSON.parse(fs.readFileSync('package.json').toString());
}
