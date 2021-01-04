/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2021 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as followRedirects from 'follow-redirects';
import * as fs from 'fs';
import * as path from 'path';
import * as inly from 'inly';

const https = followRedirects.https;

const ADOPT_OPEN_JDK_API_ROOT = 'https://api.adoptopenjdk.net/v2';

type RequestType = 'info' | 'binary' | 'latestAssets';
type ReleaseType = 'releases' | 'nightly';
export type Version = 8 | 9 | 10 | 11 | 12 | 13;
type Implementation = 'hotspot' | 'openj9';
export type Os = 'windows' | 'linux' | 'mac' | 'solaris' | 'aix';
export type Architecture = 'x64' | 'x32' | 'ppc64' | 's390x' | 'ppc64le' | 'aarch64' | 'arm';
type BinaryType = 'jdk' | 'jre';
type HeapSize = 'normal' | 'large';

interface Options {
  request?: RequestType;
  release?: ReleaseType;
  version?: Version;
  implementation?: Implementation;
  os: Os;
  architecture: Architecture;
  binary?: BinaryType;
  heapSize?: HeapSize;
}

const DEFAULT_OPTIONS = {
  request: 'binary',
  release: 'releases',
  version: 11,
  implementation: 'hotspot',
  binary: 'jre',
  heapSize: 'normal'
};

export function buildUrl(options: Options) {
  const actualOptions = Object.assign({}, DEFAULT_OPTIONS, options);
  const requestUrl = [
    ADOPT_OPEN_JDK_API_ROOT,
    actualOptions.request,
    actualOptions.release,
    `openjdk${actualOptions.version}`
  ].join('/');
  const requestParams = [
    `openjdk_impl=${actualOptions.implementation}`,
    `os=${actualOptions.os}`,
    `arch=${actualOptions.architecture}`,
    `type=${actualOptions.binary}`,
    `heap_size=${actualOptions.heapSize}`,
    `release=latest`
  ].join('&');
  return `${requestUrl}?${requestParams}`;
}

export interface DownloadResponse {
  jreZipPath: string;
  destinationDir: string;
  options: Options;
}

export function download(options: Options, destinationDir: string): Promise<DownloadResponse> {
  return new Promise((resolve, reject) => {
    try {
      if (!fs.existsSync(destinationDir)) {
        fs.mkdirSync(destinationDir);
      }
    } catch (err) {
      reject(err);
    }

    const fileToDownload = buildUrl(options);
    const extension = options.os === 'windows' ? 'zip' : 'tgz';
    const jreZipPath = path.join(destinationDir, `jre.${extension}`);

    https
      .get(fileToDownload, res => {
        const fileToSave = fs.createWriteStream(jreZipPath);
        res.pipe(fileToSave);
        fileToSave.on('finish', () => {
          fileToSave.close();
          resolve({ destinationDir, jreZipPath, options });
        });
      })
      .on('error', err => {
        fs.unlinkSync(jreZipPath);
        reject(err);
      });
  });
}

export function unzip(downloadResponse: DownloadResponse) {
  const jreDir = path.join(downloadResponse.destinationDir, 'jre');
  if (!fs.existsSync(jreDir)) {
    fs.mkdirSync(jreDir);
  }
  return new Promise((resolve, reject) => {
    const extract = inly(downloadResponse.jreZipPath, jreDir);
    extract.on('error', err => {
      reject(err);
    });
    extract.on('end', () => {
      fs.unlinkSync(downloadResponse.jreZipPath);
      // Archive for MacOS contains a file named '._xxx' which interferes with detection of extracted directory
      const extractedDir = fs.readdirSync(jreDir, { withFileTypes: true }).filter(d => d.isDirectory())[0].name;
      // Binary for MacOS has actual Java home inside '<archiveRootDir>/Contents/Home'
      const actualJavaHome =
        downloadResponse.options.os === 'mac' ? path.join(extractedDir, 'Contents', 'Home') : extractedDir;
      resolve(path.join(jreDir, actualJavaHome));
    });
  });
}
