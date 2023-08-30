import { getPackageJSON } from './fsUtils.js';
import { doForFiles, UNIVERSAL_PLATFORM, allPlatforms } from './build.js';
import fs from 'fs';
import crypto from 'crypto';
import log from 'fancy-log';

export function computeUniversalVsixHashes() {
  const version = getPackageJSON().version;
  doForFiles('.vsix', () => hashsum(UNIVERSAL_PLATFORM, version));
}

function hashsum(platform, version) {
  allPlatforms[platform].fileName =
    platform === UNIVERSAL_PLATFORM
      ? `sonarlint-vscode-${version}.vsix`
      : `sonarlint-vscode-${platform}-${version}.vsix`;

  updateHashes(platform, allPlatforms[platform].fileName);
}

function updateHashes(platform, file) {
  if (!fs.existsSync(file)) {
    log.warn(`File ${file} not found`)
    return;
  }
  const hashesObject = allPlatforms[platform].hashes;
  const binaryContent = fs.readFileSync(file, 'binary');
  for (const algo in hashesObject) {
    if (hashesObject.hasOwnProperty(algo)) {
      hashesObject[algo] = crypto.createHash(algo).update(binaryContent, 'binary').digest('hex');
      log.info(`Computed ${algo}: ${hashesObject[algo]}`);
    }
  }
}
