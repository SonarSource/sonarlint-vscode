const fs = require('fs');
const log = require('fancy-log');
const getPackageJSON = require('./fsUtils.js').getPackageJSON;

module.exports = function updateVersion() {
  const buildNumber = process.env.BUILD_NUMBER;
  const packageJSON = getPackageJSON();
  const version = packageJSON.version;
  if (version.endsWith('-SNAPSHOT') && buildNumber) {
    packageJSON.version = version.replace('-SNAPSHOT', `+${buildNumber}`);
    fs.writeFileSync('./package.json', JSON.stringify(packageJSON));
  } else {
    log.info(`Not modifying version ${version} with build number ${buildNumber}`);
  }
}

