/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
const vsce = require('vsce');
const clean = require('./fsUtils.js').clean;
const updateVersion = require('./updateVersion.js');
const downloadJre = require('./jreDownload.js');
const cycloneDx = require('./sbomGeneration.js');
const computeUniversalVsixHashes = require('./hashes.js').computeUniversalVsixHashes;
const deployBuildInfo = require('./deploy.js').deployBuildInfo;
const deployVsix = require('./deploy.js').deployVsix;
const signVsix = require('./sign.js');
const TARGETED_PLATFORMS = require('./constants.js').TARGETED_PLATFORMS;
const LATEST_JRE = require('./constants.js').LATEST_JRE;

// gulp deploy
async function buildUniversal() {
  commonPreTasks();
  await vsce.createVSIX();
  await commonPostTasks();
}

// gulp deploy-all
async function buildTargeted() {
  commonPreTasks();
  for (const platform of TARGETED_PLATFORMS) {
    await buildForPlatform(platform);
  }
  await commonPostTasks();
}

async function buildForPlatform(platform) {
  await downloadJre(platform, LATEST_JRE);
  await vsce.createVSIX({ target: platform });
}

function commonPreTasks() {
  clean();
  updateVersion();
  cycloneDx();
}

async function commonPostTasks() {
  computeUniversalVsixHashes();
  await signVsix({
    privateKeyArmored: process.env.GPG_SIGNING_KEY,
    passphrase: process.env.GPG_SIGNING_PASSPHRASE
  });
  await deployBuildInfo();
  await deployVsix();
}

module.exports = {
  buildTargeted,
  buildUniversal
};
