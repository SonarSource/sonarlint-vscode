/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
import { createVSIX } from '@vscode/vsce';
import { cleanJreDir, cleanOmnisharpDir, getPackageJSON } from './fsUtils.mjs';
import { renameSync } from 'node:fs';
import { info } from 'fancy-log';
import downloadJre from './jreDownload.mjs';
import { executeWithDurationLog, signAndDeployPackages } from './common.mjs';
import _default from './constants.mjs';
import { downloadOmnisharpAllPlatformDistributions } from './omnisharpDownload.mjs';
import { globbySync } from 'globby';

const { LATEST_JRE, OMNISHARP_VERSION, TARGETED_PLATFORMS } = _default;

export async function deployAllOpenVSX() {
  await buildOpenVSXPackages();
  renameOpenVSXPackages();
  await signAndDeployOpenVSXPackages();
}

async function buildOpenVSXPackages() {
  // Build platform-specific packages WITHOUT OmniSharp
  for (const platform of TARGETED_PLATFORMS) {
    await executeWithDurationLog(async () => {
      await downloadJre(platform, LATEST_JRE);
      await createVSIX({ target: platform });
    }, `Build-openvsx-${platform}`);
  }
  cleanJreDir();

  // Build universal package WITH OmniSharp
  await executeWithDurationLog(async () => {
    await downloadOmnisharpAllPlatformDistributions(OMNISHARP_VERSION);
    await createVSIX();
    cleanOmnisharpDir();
  }, 'Build-openvsx-universal');
}

function renameOpenVSXPackages() {
  const packageJSON = getPackageJSON();
  const { version } = packageJSON;
  
  // Rename platform-specific packages
  for (const platform of TARGETED_PLATFORMS) {
    const originalName = `sonarlint-vscode-${platform}-${version}.vsix`;
    const newName = `sonarlint-vscode-openvsx-${platform}-${version}.vsix`;
    renameSync(originalName, newName);
    info(`Renamed ${originalName} to ${newName}`);
  }
  
  // Rename universal package
  const originalUniversal = `sonarlint-vscode-${version}.vsix`;
  const newUniversal = `sonarlint-vscode-openvsx-${version}.vsix`;
  renameSync(originalUniversal, newUniversal);
  info(`Renamed ${originalUniversal} to ${newUniversal}`);
}

async function signAndDeployOpenVSXPackages() {
  info('Starting task "sign-openvsx"');
  const files = globbySync('*-openvsx*.vsix');
  
  await signAndDeployPackages({
    signFiles: files,
    deployPattern: '*-openvsx*{.vsix,-cyclonedx.json,.asc}',
    taskSuffix: 'openvsx-vsix'
  });
}

