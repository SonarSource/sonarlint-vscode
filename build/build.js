/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
const vsce = require('vsce');
const log = require('fancy-log');
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');
const request = require('request');
const fse = require('fs-extra');
const path = require('path');
const url = require('url');
const { clean, cleanJreDir, getPackageJSON } = require('./fsUtils.js');
const { updateVersion } = require('./updateVersion.js');
const exec = require('child_process').exec;

const UNIVERSAL_MODE = '--universal';
const ALL_TARGETS_MODE = '--all';
const LATEST_JRE = 17;
const UNIVERSAL_PLATFORM = 'universal';
const TARGETED_PLATFORMS = ['win32-x64'];
// const TARGETED_PLATFORMS = ['win32-x64', 'linux-x64', 'darwin-x64', 'darwin-arm64'];
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

build();

// usage examples:
// node build.js --universal
// node build.js --all
async function build() {
  const mode = getMode();

  if (mode === UNIVERSAL_MODE) {
    await buildUniversal();
  }
  await buildAll();
}

async function buildUniversal() {
  commonPreTasks();
  await vsce.createVSIX();
  commonPostTasks();
}

async function buildAll() {
  commonPreTasks();
  for (const platform of TARGETED_PLATFORMS) {
    await buildForPlatform(platform);
  }
  cleanJreDir();
  await vsce.createVSIX();
  commonPostTasks();
}

async function buildForPlatform(platform) {
  await downloadJre(platform, LATEST_JRE);
  await vsce.createVSIX({ target: platform });
}

function downloadFile(endpoint, fileName) {
  https.get(endpoint, res => {
    const writeStream = fs.createWriteStream(fileName);
    res.pipe(writeStream);
    writeStream.on('end', function () {
      writeStream.close();
      console.log('The download is Completed');
    });
  });
}

async function downloadJre(targetPlatform, javaVersion) {
  cleanJreDir();
  fse.ensureDir('./jre', err => {
    console.log(err);
  });

  const platformMapping = {
    'linux-arm64': 'linux-aarch64',
    'linux-x64': 'linux-x86_64',
    'darwin-arm64': 'macosx-aarch64',
    'darwin-x64': 'macosx-x86_64',
    'win32-x64': 'win32-x86_64'
  };

  if (!targetPlatform || !Object.keys(platformMapping).includes(targetPlatform)) {
    console.log(
      '[Error] download_jre failed, please specify a valid target platform via --target argument. ' +
        'Here are the supported platform list:'
    );
    for (const platform of Object.keys(platformMapping)) {
      console.log(platform);
    }
    return;
  }

  console.log(`Downloading justj JRE ${javaVersion} for the platform ${targetPlatform} ...`);

  const manifestUrl = `https://download.eclipse.org/justj/jres/${javaVersion}/downloads/latest/justj.manifest`;
  // Download justj.manifest file
  const manifest = await new Promise(function (resolve, reject) {
    request.get(manifestUrl, function (err, response, body) {
      if (err || response.statusCode >= 400) {
        reject(err || `${response.statusCode} returned from ${manifestUrl}`);
      } else {
        resolve(String(body));
      }
    });
  });

  if (!manifest) {
    // TODO log error
    // done(new Error(`Failed to download justj.manifest, please check if the link ${manifestUrl} is valid.`));
    return;
  }

  /**
   * Here are the contents for a sample justj.manifest file:
   * ../20211012_0921/org.eclipse.justj.openjdk.hotspot.jre.full.stripped-17-linux-aarch64.tar.gz
   * ../20211012_0921/org.eclipse.justj.openjdk.hotspot.jre.full.stripped-17-linux-x86_64.tar.gz
   * ../20211012_0921/org.eclipse.justj.openjdk.hotspot.jre.full.stripped-17-macosx-aarch64.tar.gz
   * ../20211012_0921/org.eclipse.justj.openjdk.hotspot.jre.full.stripped-17-macosx-x86_64.tar.gz
   * ../20211012_0921/org.eclipse.justj.openjdk.hotspot.jre.full.stripped-17-win32-x86_64.tar.gz
   */
  const javaPlatform = platformMapping[targetPlatform];
  const list = manifest.split(/\r?\n/);
  const jreIdentifier = list.find(value => {
    return (
      value.indexOf('org.eclipse.justj.openjdk.hotspot.jre.full.stripped') >= 0 && value.indexOf(javaPlatform) >= 0
    );
  });

  if (!jreIdentifier) {
    // TODO log error
    // done(new Error(`justj doesn't support the jre ${javaVersion} for the platform ${javaPlatform}
    //   (${targetPlatform}), please refer to the link ${manifestUrl} for the supported platforms.`));
    return;
  }

  const jreDownloadUrl = `https://download.eclipse.org/justj/jres/${javaVersion}/downloads/latest/${jreIdentifier}`;
  const parsedDownloadUrl = url.parse(jreDownloadUrl);
  const jreFileName = path.basename(parsedDownloadUrl.pathname).replace(/\.(?:7z|bz2|gz|rar|tar|zip|xz)*$/, '');
  const idx = jreFileName.indexOf('-');
  const jreVersionLabel = idx >= 0 ? jreFileName.substring(idx + 1) : jreFileName;
  // Download justj JRE.

  await downloadFile(jreDownloadUrl, `./jre/${jreFileName}`);
  // TODO decompress .tar file with JRE
}

function cyclonedx() {
  const packageJSON = getPackageJSON();
  const version = packageJSON.version;
  const cycloneDxCommand = `npm run cyclonedx-run -- -d --output sonarlint-vscode-${version}.sbom-cyclonedx.json`;
  exec(cycloneDxCommand, (err, stdout, stderr) => {
    console.log(stdout);
    console.log(stderr);
  });
}

function commonPreTasks() {
  clean();
  cyclonedx();
  updateVersion();
}

function commonPostTasks() {
  computeUniversalVsixHashes();
  sign();
  deployBuildInfo();
  deployVsix();
}

function computeUniversalVsixHashes() {
  const version = getPackageJSON().version;
  doForFiles('.vsix', () => hashsum(UNIVERSAL_PLATFORM, version));
}

function sign() {}

function deployBuildInfo() {}

function deployVsix() {}

function hashsum(platform, version) {
  allPlatforms[platform].fileName =
    platform === UNIVERSAL_PLATFORM
      ? `sonarlint-vscode-${version}.vsix`
      : `sonarlint-vscode-${platform}-${version}.vsix`;

  updateHashes(platform, allPlatforms[platform].fileName);
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

function updateHashes(platform, file) {
  if (!fs.existsSync(file)) {
    return;
  }
  const hashesObject = allPlatforms[platform].hashes;
  const binaryContent = fs.readFileSync(file, 'binary');
  console.log(`Hashes object: ` + JSON.stringify(hashesObject));
  console.log(`Binary content: `);
  console.log(`Binary content: ` + JSON.stringify(binaryContent));
  for (const algo in hashesObject) {
    if (hashesObject.hasOwnProperty(algo)) {
      hashesObject[algo] = crypto.createHash(algo).update(binaryContent, 'binary').digest('hex');
      log.info(`Computed ${algo}: ${hashesObject[algo]}`);
    }
  }
  //updateBinaryHashes(fs.readFileSync(file, 'binary'), allPlatforms[platform].hashes);
}

function updateBinaryHashes(binaryContent, hashesObject) {
  for (const algo in hashesObject) {
    if (hashesObject.hasOwnProperty(algo)) {
      hashesObject[algo] = crypto.createHash(algo).update(binaryContent, 'binary').digest('hex');
      log.info(`Computed ${algo}: ${hashesObject[algo]}`);
    }
  }
}

function getMode() {
  if (process.argv.indexOf(ALL_TARGETS_MODE) >= 0) {
    return ALL_TARGETS_MODE;
  }
  return UNIVERSAL_MODE;
}
