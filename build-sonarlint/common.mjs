/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
  import { createVSIX } from '@vscode/vsce';
import { clean, cleanOmnisharpDir } from './fsUtils.mjs';
import { info } from 'fancy-log';
import downloadJre from './jreDownload.mjs';
import cycloneDx from './sbomGeneration.mjs';
import { computeUniversalVsixHashes } from './hashes.mjs';
import { deployBuildInfo, deployVsixWithPattern } from './deployUtils.mjs';
import populateBuildNumber from './populateBuildNumber.mjs';
import signVsix from './sign.mjs';
import _default from './constants.mjs';
import {
  downloadOmnisharpAllPlatformDistributions,
  downloadAndExtractOmnisharp,
  omnisharpPlatformMapping
} from './omnisharpDownload.mjs';
const { TARGETED_PLATFORMS, LATEST_JRE, OMNISHARP_VERSION } = _default;

export async function deployUniversal() {
  commonPreBuildTasks();
  await buildUniversal();
  await commonPostBuildTasks();
  await deployBuildInfo();
}

export async function deployAllMicrosoft() {
  commonPreBuildTasks();
  await buildUniversal();
  await buildTargeted();
  await commonPostBuildTasks();
}

async function buildUniversal() {
  await downloadOmnisharpAllPlatformDistributions(OMNISHARP_VERSION);
  await createVSIX();
}

async function buildTargeted() {
  for (const platform of TARGETED_PLATFORMS) {
    await executeWithDurationLog(async () => {
      await buildForPlatform(platform);
    }, `Build-for-${platform}-platform`);
  }
}

async function buildForPlatform(platform) {
  await downloadJre(platform, LATEST_JRE);
  await downloadAndExtractOmnisharp(OMNISHARP_VERSION, omnisharpPlatformMapping[platform]);
  await downloadAndExtractOmnisharp(OMNISHARP_VERSION, 'net6');
  await createVSIX({ target: platform });
  cleanOmnisharpDir();
}

function commonPreBuildTasks() {
  clean();
  populateBuildNumber();
  cycloneDx();
}

async function commonPostBuildTasks() {
  computeUniversalVsixHashes();
  await signAndDeployPackages();
}

export async function signAndDeployPackages(options = {}) {
  const {
    signFiles = null,
    deployPattern = '*{.vsix,-cyclonedx.json,.asc}',
    taskSuffix = 'vsix'
  } = options;

  await signVsix({
    privateKeyArmored: process.env.GPG_SIGNING_KEY,
    passphrase: process.env.GPG_SIGNING_PASSPHRASE
  }, signFiles);

  await executeWithDurationLog(async () => {
    await deployVsixWithPattern(deployPattern);
  }, `Deploy-${taskSuffix}`);
}

export async function executeWithDurationLog(callback, taskName) {
  info(`Starting '${taskName}'...`);
  const startTime = performance.now();
  await callback();
  const endTime = performance.now();
  const ONE_SECOND = 1000;
  const seconds = Math.ceil((endTime - startTime) / ONE_SECOND);
  info(`Finished '${taskName}' after ${seconds}s`);
}
