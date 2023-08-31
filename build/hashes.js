const getPackageJSON = require('./fsUtils.js').getPackageJSON;
const UNIVERSAL_PLATFORM = require('./constants.js').UNIVERSAL_PLATFORM;
const TARGETED_PLATFORMS = require('./constants.js').TARGETED_PLATFORMS;
const fs = require('fs');
const crypto = require('crypto');
const log = require('fancy-log');
const path = require('path');

const allPlatforms = {};
[...TARGETED_PLATFORMS, UNIVERSAL_PLATFORM].forEach(platform => {
  allPlatforms[platform] = {
    fileName: '',
    hashes: {
      md5: '',
      sha1: ''
    }
  };
});

function computeUniversalVsixHashes() {
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

function fileHashsum(filePath) {
  const fileContent = fs.readFileSync(filePath);
  return ['sha1', 'md5'].map(algo => {
    const hash = crypto.createHash(algo).update(fileContent, 'binary').digest('hex');
    log.info(`Computed "${path.basename(filePath)}" ${algo}: ${hash}`);
    return hash;
  });
}

function computeDependencyHashes(dependencyLocation) {
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

function doForFiles(extensions, callback) {
  fs.readdir('./', function (err, files) {
    if (err) {
      console.log('Unable to scan directory: ' + err);
      return;
    }

    files.forEach(function (file) {
      if (fileHasExtension(file, extensions)) {
        callback(file);
      }
    });
  });
}

function fileHasExtension(file, extensions) {
  const fileExtension = path.extname(file);
  if (typeof extensions === 'string') {
    return fileExtension === extensions;
  }
  return extensions.includes(fileExtension);
}

module.exports = {
  computeDependencyHashes,
  fileHashsum,
  computeUniversalVsixHashes
}
