/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
const fs = require('fs');
const crypto = require('crypto');
const request = require('request');

const {
  ARTIFACTORY_PRIVATE_READER_USERNAME,
  ARTIFACTORY_PRIVATE_READER_PASSWORD
} = process.env;

const auth = {
  user: ARTIFACTORY_PRIVATE_READER_USERNAME,
  pass: ARTIFACTORY_PRIVATE_READER_PASSWORD,
  sendImmediate: true
};
const credentialsDefined = ARTIFACTORY_PRIVATE_READER_USERNAME !== undefined
    && ARTIFACTORY_PRIVATE_READER_PASSWORD !== undefined;

const repoxRoot = 'https://repox.jfrog.io/repox/sonarsource';
const jarDependencies = require('./dependencies.json');
const log = require('fancy-log');

const HTTP_OK = 200;

if (!fs.existsSync('server')) {
  fs.mkdirSync('server');
}

if (!fs.existsSync('analyzers')) {
  fs.mkdirSync('analyzers');
}

jarDependencies.map(dep => {
  if (dep.requiresCredentials && !credentialsDefined) {
    console.info(`Skipping download of ${dep.artifactId}, no credentials`);
    return;
  }
  downloadIfNeeded(artifactUrl(dep), dep.output);
});

function artifactUrl(dep) {
  const groupIdForArtifactory = dep.groupId.replace(/\./g, '/');
  return `${repoxRoot}/${groupIdForArtifactory}/${dep.artifactId}/${dep.version}/${dep.artifactId}-${dep.version}.jar`;
}

function downloadIfNeeded(url, dest) {
  if (url.startsWith('file:')) {
    fs.createReadStream(url.substring('file:'.length)).pipe(fs.createWriteStream(dest));
  } else {
    const callback = (error, response, body) => {
      if (error) {
        throw error;
      } else if (response.statusCode !== HTTP_OK) {
        throw new Error(`Unable to get file ${url}: ${response.statusCode} ${body}`);
      } else {
        downloadIfChecksumMismatch(body, url, dest);
      }
    };
    if (credentialsDefined) {
      request(url + '.sha1', {auth}, callback);
    } else {
      request(url + '.sha1', callback);
    }
  }
}

function downloadIfChecksumMismatch(expectedChecksum, url, dest) {
  if (!fs.existsSync(dest)) {
    sendRequest(url)
        .on('error', function (err) {
          throw err;
        })
        .pipe(fs.createWriteStream(dest));
  } else {
    fs.createReadStream(dest)
      .pipe(crypto.createHash('sha1').setEncoding('hex'))
      .on('finish', function () {
        const sha1 = this.read();
        if (expectedChecksum !== sha1) {
          console.info(`Checksum mismatch for '${dest}'. Will download it!`);
          sendRequest(url)
            .on('error', function (err) {
              throw err;
            })
            .on('response', function (response) {
              if (response.statusCode !== HTTP_OK) {
                throw new Error(`Unable to get file ${url}: ${response.statusCode}`);
              }
            })
            .pipe(fs.createWriteStream(dest));
        }
      });
  }
}

function sendRequest(url) {
  const callback = (error, _response, _body) => {
    if (error) {
      log.error('Got error during downloading ' + url, error);
    }
  };
  if (credentialsDefined) {
    return request(url, { auth }, callback);
  } else {
    return request(url, callback);
  }
}
