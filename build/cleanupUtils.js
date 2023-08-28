import del from 'del';
import fse from 'fs-extra';

export function clean() {
  del(['*.vsix', 'server', 'out', 'out-cov']);
}

export function cleanJreDir() {
  if (fse.existsSync('./jre')) {
    fse.removeSync('./jre');
  }
}

clean();
cleanJreDir();
