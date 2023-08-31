const del = require('del');
const fse = require('fs-extra');
const fs = require('fs');

function clean() {
  del(['*.vsix', 'server', 'out', 'out-cov']);
}

function cleanJreDir() {
  if (fse.existsSync('./jre')) {
    fse.removeSync('./jre');
  }
}

function getPackageJSON() {
  return JSON.parse(fs.readFileSync('package.json').toString());
}

function deleteFile(filePath) {
  fs.unlinkSync(filePath);
}

module.exports = {
  clean,
  cleanJreDir,
  getPackageJSON,
  deleteFile
}
