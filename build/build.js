/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
import vsce from 'vsce';
import fs from 'fs';
import path from 'path';
import { clean, cleanJreDir } from './fsUtils.js';
import { updateVersion } from './updateVersion.js';
import { downloadJre } from './jreDownload.js';
import { cycloneDx } from './sbomGeneration.js';
import { computeUniversalVsixHashes } from './hashes.js';
import { deployBuildInfo, deployVsix } from './deploy.js';
import { signVsix } from './sign.js';

const LATEST_JRE = 17;
export const UNIVERSAL_PLATFORM = 'universal';
export const TARGETED_PLATFORMS = ['win32-x64', 'linux-x64', 'darwin-x64', 'darwin-arm64'];
export const allPlatforms = {};
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
  await buildUniversal();
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
