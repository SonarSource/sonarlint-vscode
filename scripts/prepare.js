/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2020 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
const fs = require('fs');
const crypto = require('crypto');
const request = require('request');

const repoxRoot = 'https://repox.jfrog.io/repox/sonarsource';
const jarDependencies = require('./dependencies.json');

const HTTP_OK = 200;

if (!fs.existsSync('server')) {
  fs.mkdirSync('server');
}

if (!fs.existsSync('analyzers')) {
  fs.mkdirSync('analyzers');
}

jarDependencies.map(dep => {
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
    request(url + '.sha1', (error, response, body) => {
      if (error) {
        throw error;
      } else if (response.statusCode !== HTTP_OK) {
        throw new Error(`Unable to get file ${url}: ${response.statusCode} ${body}`);
      } else {
        downloadIfChecksumMismatch(body, url, dest);
      }
    });
  }
}

function downloadIfChecksumMismatch(expectedChecksum, url, dest) {
  if (!fs.existsSync(dest)) {
    request(url).pipe(fs.createWriteStream(dest));
  } else {
    fs.createReadStream(dest)
      .pipe(crypto.createHash('sha1').setEncoding('hex'))
      .on('finish', function () {
        const sha1 = this.read();
        if (expectedChecksum !== sha1) {
          console.info(`Checksum mismatch for '${dest}'. Will download it!`);
          request(url)
            .on('error', function (err) {
              throw error;
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
