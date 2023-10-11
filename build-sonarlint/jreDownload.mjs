/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
import { cleanJreDir, deleteFile } from './fsUtils.mjs';
import { ensureDir } from 'fs-extra';
import { parse } from 'url';
import { basename } from 'path';
import { error, info } from 'fancy-log';
import fetch from 'node-fetch';
import { existsSync, mkdirSync, createReadStream, createWriteStream } from 'fs';
import { extract } from 'tar';
import { createGunzip } from 'node:zlib';

const HTTP_BAD_REQUEST = 400;

export default async function downloadJre(targetPlatform, javaVersion) {
  cleanJreDir();

  await new Promise((resolve, reject) => {
    ensureDir('./jre', err => {
      if (err) {
        error(`Error while ensuring existance of ./jre folder.${err}`);
        reject(err);
      }
    });
    resolve();
  })

  const platformMapping = {
    'linux-arm64': 'linux-aarch64',
    'linux-x64': 'linux-x86_64',
    'darwin-arm64': 'macosx-aarch64',
    'darwin-x64': 'macosx-x86_64',
    'win32-x64': 'win32-x86_64'
  };

  if(!isValidParams(targetPlatform, platformMapping)) {
    throw new Error('Invalid param');
  }

  info(`Downloading justj JRE ${javaVersion} for the platform ${targetPlatform} ...`);

  const manifestUrl = `https://download.eclipse.org/justj/jres/${javaVersion}/downloads/latest/justj.manifest`;
  // Download justj.manifest file
  const manifest = await new Promise(function (resolve, reject) {
    fetch(manifestUrl).then(response => {
      const BAD_REQUEST_STATUS_CODE = 400;
      if (!response.ok || response.status >= BAD_REQUEST_STATUS_CODE) {
        reject(response.error || `${response.status} returned from ${manifestUrl}`);
      } else {
        resolve(response.text());
      }
    });
  });

  if (!manifest) {
    const message = `Failed to download justj.manifest, please check if the link ${manifestUrl} is valid.`;
    error(message);
    throw new Error(message);
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
    const message = `justj doesn't support the jre ${javaVersion} for the platform ${javaPlatform}
     (${targetPlatform}), please refer to the link ${manifestUrl} for the supported platforms.`;
    error(message);
    throw new Error(message);
  }

  const jreDownloadUrl = `https://download.eclipse.org/justj/jres/${javaVersion}/downloads/latest/${jreIdentifier}`;
  const parsedDownloadUrl = parse(jreDownloadUrl);
  const jreFileName = basename(parsedDownloadUrl.pathname).replace(/\.(?:7z|bz2|gz|rar|tar|zip|xz)*$/, '');
  const idx = jreFileName.indexOf('-');
  const jreVersionLabel = idx >= 0 ? jreFileName.substring(idx + 1) : jreFileName;
  // Download justj JRE.

  await downloadFile(jreDownloadUrl, `./jre/${jreFileName}`);

  const inputFilePath = `./jre/${jreFileName}`;
  const outputFolderPath = './jre/' + jreVersionLabel;
  if (!existsSync(outputFolderPath)) {
    mkdirSync(outputFolderPath);
  }

  const compressedReadStream = createReadStream(inputFilePath);
  const decompressionStream = createGunzip();
  const extractionStream = extract({
    cwd: outputFolderPath // Set the current working directory for extraction
  });
  compressedReadStream.pipe(decompressionStream).pipe(extractionStream);

  return new Promise((resolve, reject) => {
    extractionStream.on('finish', () => {
      info('Extraction complete.');
      deleteFile(inputFilePath);
      resolve();
    });
    compressedReadStream.on('error', err => {
      error('Error reading compressed file:', err);
      reject(err);
    });
    decompressionStream.on('error', err => {
      error('Error decompressing:', err);
      reject(err);
    });
    extractionStream.on('error', err => {
      error('Error extracting:', err);
      reject(err);
    });
  });
}

function isValidParams(targetPlatform, platformMapping) {
  if (!targetPlatform || !Object.keys(platformMapping).includes(targetPlatform)) {
    error(
      '[Error] download_jre failed, please specify a valid target platform via --target argument. ' +
      'Here are the supported platform list:'
    );
    for (const platform of Object.keys(platformMapping)) {
      info(platform);
    }
    return false;
  }
  return true;
}

export async function downloadFile(fileUrl, destPath) {
  return new Promise(function (resolve, reject) {
    fetch(fileUrl).then(function (res) {
      const fileStream = createWriteStream(destPath);
      res.body.on('error', reject);
      if (res.statusCode >= HTTP_BAD_REQUEST) {
        reject(new Error(`Unexpected HTTP status code: ${res.statusCode} - ${res.statusText}`));
      }
      fileStream.on('finish', resolve);
      res.body.pipe(fileStream);
    });
  });
}
