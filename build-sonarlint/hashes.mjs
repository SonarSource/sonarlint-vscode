/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
import { getPackageJSON } from './fsUtils.mjs';
import _default from './constants.mjs';
const { UNIVERSAL_PLATFORM, TARGETED_PLATFORMS } = _default;
import { existsSync, readFileSync } from 'fs';
import { createHash } from 'crypto';
import { warn, info } from 'fancy-log';
import { join, basename } from 'path';
import { globbySync } from 'globby';

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

export function computeUniversalVsixHashes() {
  info('Starting task "computeUniversalVsixHashes"')
  const version = getPackageJSON().version;
  globbySync(join('*.vsix')).forEach(() => hashsum(UNIVERSAL_PLATFORM, version));
}

function hashsum(platform, version) {
  allPlatforms[platform].fileName =
    platform === UNIVERSAL_PLATFORM
      ? `sonarlint-vscode-${version}.vsix`
      : `sonarlint-vscode-${platform}-${version}.vsix`;

  updateHashes(platform, allPlatforms[platform].fileName);
}

function updateHashes(platform, file) {
  if (!existsSync(file)) {
    warn(`File ${file} not found`);
    return;
  }
  const hashesObject = allPlatforms[platform].hashes;
  const binaryContent = readFileSync(file, 'binary');
  for (const algo in hashesObject) {
    if (hashesObject.hasOwnProperty(algo)) {
      hashesObject[algo] = createHash(algo).update(binaryContent, 'binary').digest('hex');
      info(`Computed ${algo}: ${hashesObject[algo]}`);
    }
  }
}

export function fileHashsum(filePath) {
  const fileContent = readFileSync(filePath);
  return ['sha1', 'md5'].map(algo => {
    const hash = createHash(algo).update(fileContent, 'binary').digest('hex');
    info(`Computed "${basename(filePath)}" ${algo}: ${hash}`);
    return hash;
  });
}

export function computeDependencyHashes(dependencyLocation) {
  const dependencyContents = readFileSync(dependencyLocation);
  const dependencyHashes = { md5: '', sha1: '' };
  updateBinaryHashes(dependencyContents, dependencyHashes);
  return dependencyHashes;
}

function updateBinaryHashes(binaryContent, hashesObject) {
  for (const algo in hashesObject) {
    if (hashesObject.hasOwnProperty(algo)) {
      hashesObject[algo] = createHash(algo).update(binaryContent, 'binary').digest('hex');
      info(`Computed ${algo}: ${hashesObject[algo]}`);
    }
  }
}

