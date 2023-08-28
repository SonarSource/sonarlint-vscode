/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
import { exec } from 'child_process';
import { createHash } from 'crypto';
import { error as _error } from 'fancy-log';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';

import fetch from 'node-fetch';
import { promisify } from 'util';

const execAsync = promisify(exec);

const { ARTIFACTORY_PRIVATE_READER_USERNAME, ARTIFACTORY_PRIVATE_READER_PASSWORD } = process.env;

const auth = {
  user: ARTIFACTORY_PRIVATE_READER_USERNAME,
  pass: ARTIFACTORY_PRIVATE_READER_PASSWORD
};

const credentialsDefined =
  ARTIFACTORY_PRIVATE_READER_USERNAME !== undefined && ARTIFACTORY_PRIVATE_READER_PASSWORD !== undefined;

const repoxRoot = 'https://repox.jfrog.io/repox/sonarsource';

const jarDependencies = JSON.parse(readFileSync(resolve(dirname(''), 'scripts/dependencies.json')));

const HTTP_OK = 200;

if (!existsSync('server')) {
  mkdirSync('server');
}

if (!existsSync('analyzers')) {
  mkdirSync('analyzers');
}

jarDependencies.map(async dep => {
  if (dep.requiresCredentials && !credentialsDefined) {
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
  return `${repoxRoot}/${groupIdForArtifactory}/${dep.artifactId}/${dep.version}/${dep.artifactId}-${dep.version}.jar`;
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
    if (credentialsDefined) {
      fetch(url + '.sha1', {
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${auth.user}:${auth.pass}`).toString('base64')
        }
      })
        .then(callback)
        .catch(err => {
            throw new Error(err);
          });
    } else {
      fetch(url + '.sha1')
        .then(callback)
        .catch(err => {
        throw new Error(err);
      });
    }
  }
}

async function downloadIfChecksumMismatch(expectedChecksum, url, dest) {
  if (!existsSync(dest)) {
    (await sendRequest(url))
      .pipe(createWriteStream(dest));
  } else {
    createReadStream(dest)
      .pipe(createHash('sha1').setEncoding('hex'))
      .on('finish', async function() {
        const sha1 = this.read();
        if (expectedChecksum !== sha1) {
          console.info(`Checksum mismatch for '${dest}'. Will download it!`);
          (await sendRequest(url))
            .pipe(createWriteStream(dest));
        }
      });
  }
}

function sendRequest(url) {
  if (credentialsDefined) {
    return fetch(url, {
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${auth.user}:${auth.pass}`).toString('base64')
      }})
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
  } else {
    return fetch(url)
      .then(response => response.body)
      .catch(err => {
        throw new Error(err);
      });
  }
}
