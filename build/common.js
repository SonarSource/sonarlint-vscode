/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
const vsce = require('vsce');
const fs = require('fs');
const path = require('path');
const clean = require('./fsUtils.js').clean;
const updateVersion = require('./updateVersion.js');
const downloadJre = require('./jreDownload.js');
const cycloneDx = require('./sbomGeneration.js');
const computeUniversalVsixHashes = require('./hashes.js').computeUniversalVsixHashes;
const deployBuildInfo = require('./deploy.js').deployBuildInfo;
const deployVsix = require('./deploy.js').deployVsix;
const signVsix = require('./sign.js');

const LATEST_JRE = 17;
const UNIVERSAL_PLATFORM = 'universal';
const TARGETED_PLATFORMS = ['win32-x64', 'linux-x64', 'darwin-x64', 'darwin-arm64'];
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

// gulp deploy
async function buildUniversal() {
  commonPreTasks();
  await vsce.createVSIX();
  commonPostTasks();
}

// gulp deploy-all
async function buildAll() {
  commonPreTasks();
  for (const platform of TARGETED_PLATFORMS) {
    await buildForPlatform(platform);
  }
  commonPostTasks();
}

async function buildForPlatform(platform) {
  await downloadJre(platform, LATEST_JRE);
  await vsce.createVSIX({ target: platform });
}

function commonPreTasks() {
  clean();
  cycloneDx();
  updateVersion();
}

function commonPostTasks() {
  computeUniversalVsixHashes();
  signVsix({
    privateKeyArmored: process.env.GPG_SIGNING_KEY,
    passphrase: process.env.GPG_SIGNING_PASSPHRASE
  });
  deployBuildInfo();
  deployVsix();
}

export function doForFiles(extensions, callback) {
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
  buildAll,
  buildUniversal,
  UNIVERSAL_PLATFORM,
  TARGETED_PLATFORMS,
  allPlatforms
}