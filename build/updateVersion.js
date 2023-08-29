import fs from 'fs';
import log from 'fancy-log';
import { getPackageJSON } from './fsUtils.js';

export function updateVersion() {
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

updateVersion();
