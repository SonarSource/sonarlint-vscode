/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
import { exec } from 'child_process';
import { createHash } from 'crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, unlinkSync } from 'fs';
import { dirname, join, resolve } from 'path';
import * as unzipper from 'unzipper';
import { extract } from 'tar';
import { createGunzip } from 'node:zlib';

import { promisify } from 'util';

import artifactory from './artifactory.mjs';
import { Readable } from 'node:stream';

const execAsync = promisify(exec);
const ESLINT_BRIDGE_SERVER_BUNDLE_PATH_MATCHER = /sonarjs-\d+\.\d+\.\d+\.tgz/;

const { jarDependencies } = JSON.parse(readFileSync(resolve(dirname(''), 'package.json')).toString('utf8'));

if (!existsSync('server')) {
  mkdirSync('server');
}

if (!existsSync('analyzers')) {
  mkdirSync('analyzers');
}

jarDependencies.map(async dep => {
  if (dep.requiresCredentials && !artifactory.credentialsDefined) {
    console.info(`Skipping download of ${dep.artifactId}, no credentials`);
    return;
  }
  downloadIfNeeded(await artifactUrl(dep), dep.output);
});

async function artifactUrl(dep) {
  const groupIdForArtifactory = dep.groupId.replace(/\./g, '/');

  if (dep.path) {
    // If path is manually defined, use it
    console.log(`Getting ${dep.artifactId} from ${dep.path}`);
    return dep.path;
  } else if (dep.version.includes('-SNAPSHOT')) {
    // Get SNAPSHOT dependencies from local maven repo
    try {
      const localMavenRepo = (
        await execAsync('mvn help:evaluate -Dexpression=settings.localRepository -q -DforceStdout')
      ).stdout;
      if (existsSync(localMavenRepo)) {
        console.log('Will use local ' + dep.artifactId);
        const localJarPath = join(
          localMavenRepo,
          groupIdForArtifactory,
          dep.artifactId,
          dep.version,
          `${dep.artifactId}-${dep.version}.jar`
        );
        return 'file:'.concat(localJarPath);
      }
    } catch (err) {
      console.log(
        `Could not find local maven repository in order to get ${dep.artifactId} JAR. Skipping this dependency.`);
      console.log(`Reason: ${err}`);
      return null;
    }
  }
  return `${artifactory.repoRoot}/${groupIdForArtifactory}/${dep.artifactId}/${dep.version}/${dep.artifactId}-${dep.version}.jar${dep.signatureOnly ? '.asc' : ''}`;
}

function downloadIfNeeded(url, dest) {
  if (!url) {
    return;
  } else if (url.startsWith('file:')) {
    createReadStream(url.substring('file:'.length)).pipe(createWriteStream(dest));
  } else {
    const callback = async (response) => {
      if (!response.ok) {
        throw new Error(`Unable to get file ${url}: ${response.statusCode} ${response.text()}`);
      } else {
        downloadIfChecksumMismatch(await response.text(), url, dest);
      }
    };
    artifactory.maybeAuthenticatedFetch(url + '.sha1')
      .then(callback)
      .catch(err => {
          throw new Error(err);
        });
  }
}

async function actuallyDownloadFile(url, dest) {
  const fetchedBody = await sendRequest(url);
  const writeStream = createWriteStream(dest, { flags: 'w' });
  writeStream.on('finish', async () => {
    if (dest.endsWith('sonarjs.jar')) {
      await unzipEslintBridgeBundle(dest);
    }
  });
  await Readable.fromWeb(fetchedBody).pipe(writeStream);
}

async function downloadIfChecksumMismatch(expectedChecksum, url, dest) {
  if (!existsSync(dest)) {
    await actuallyDownloadFile(url, dest);
  } else {
    createReadStream(dest)
      .pipe(createHash('sha1').setEncoding('hex'))
      .on('finish', async function() {
        const sha1 = this.read();
        if (expectedChecksum !== sha1) {
          console.info(`Checksum mismatch for '${dest}'. Will download it!`);
          await actuallyDownloadFile(url, dest);
        }
      });
  }
}

function sendRequest(url) {
  return artifactory.maybeAuthenticatedFetch(url)
    .then(response => {
      if(!response.ok) {
        throw new Error(`Unable to get file ${url}: ${response.status}`);
      } else {
        return response.body;
      }
    })
    .catch(err => {
      throw new Error(err);
    });
}

async function unzipEslintBridgeBundle(jarPath) {
  const directory = await unzipper.Open.file(jarPath);

  const file = directory.files.find(d => ESLINT_BRIDGE_SERVER_BUNDLE_PATH_MATCHER.test(d.path));
  if (!file) {
    throw new Error(`eslint bridge server bundle not found in JAR ${jarPath}`);
  }

  const outputFolderPath = join('.', 'eslint-bridge');
  const outputFilePath = join('.', 'eslint-bridge', 'sonarjs.tgz');
  if (!existsSync(outputFolderPath)) {
    mkdirSync(outputFolderPath);
  }

  file.stream().pipe(createWriteStream(outputFilePath))
    .on('finish',  async () => {
      const compressedReadStream = createReadStream(join('.', outputFilePath));
      const decompressionStream = createGunzip();
      const extractionStream = extract({
        cwd: outputFolderPath // Set the current working directory for extraction
      });
      compressedReadStream.pipe(decompressionStream).pipe(extractionStream);

      await new Promise((resolve, reject) => {
        extractionStream.on('finish', () => {
          resolve();
        });
        compressedReadStream.on('error', err => {
          console.log(err);
          reject(err);
        });
        decompressionStream.on('error', err => {
          console.error(err);
          reject(err);
        });
        extractionStream.on('error', err => {
          console.error(err);
          reject(err);
        });
      });

      unlinkSync(outputFilePath)
    });
}
