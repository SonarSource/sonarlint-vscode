import { getPackageJSON } from './fsUtils.js';
import { doForFiles, UNIVERSAL_PLATFORM, allPlatforms } from './build.js';
import fs from 'fs';
import crypto from 'crypto';
import log from 'fancy-log';
import path from 'path';

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
    log.warn(`File ${file} not found`);
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

export function fileHashsum(filePath) {
  const fileContent = fs.readFileSync(filePath);
  return ['sha1', 'md5'].map(algo => {
    const hash = crypto.createHash(algo).update(fileContent, 'binary').digest('hex');
    log.info(`Computed "${path.basename(filePath)}" ${algo}: ${hash}`);
    return hash;
  });
}

export function computeDependencyHashes(dependencyLocation) {
  const dependencyContents = fs.readFileSync(dependencyLocation);
  const dependencyHashes = { md5: '', sha1: '' };
  updateBinaryHashes(dependencyContents, dependencyHashes);
  return dependencyHashes;
}

function updateBinaryHashes(binaryContent, hashesObject) {
  for (const algo in hashesObject) {
    if (hashesObject.hasOwnProperty(algo)) {
      hashesObject[algo] = crypto.createHash(algo).update(binaryContent, 'binary').digest('hex');
      log.info(`Computed ${algo}: ${hashesObject[algo]}`);
    }
  }
}
