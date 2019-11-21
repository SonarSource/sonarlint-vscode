/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2019 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
const fs = require('fs');
const crypto = require('crypto');
const request = require('request');

const repoxRoot = 'https://repox.jfrog.io/repox/sonarsource';
const jarDependencies = [
  {
    groupId: 'org/sonarsource/sonarlint/ls',
    artifactId: 'sonarlint-language-server',
    version: '1.0.0.12317',
    output: 'server/sonarlint-ls.jar'
  },
  {
    groupId: 'org/sonarsource/javascript',
    artifactId: 'sonar-javascript-plugin',
    version: '5.1.1.7506',
    output: 'analyzers/sonarjs.jar'
  },
  {
    groupId: 'org/sonarsource/php',
    artifactId: 'sonar-php-plugin',
    version: '3.2.0.4868',
    output: 'analyzers/sonarphp.jar'
  },
  {
    groupId: 'org/sonarsource/python',
    artifactId: 'sonar-python-plugin',
    version: '1.15.1.4116',
    output: 'analyzers/sonarpython.jar'
  },
  {
    groupId: 'org/sonarsource/typescript',
    artifactId: 'sonar-typescript-plugin',
    version: '1.9.0.3766',
    output: 'analyzers/sonarts.jar'
  },
  {
    groupId: 'org/sonarsource/html',
    artifactId: 'sonar-html-plugin',
    version: '3.2.0.2082',
    output: 'analyzers/sonarhtml.jar'
  }
];

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
  return `${repoxRoot}/${dep.groupId}/${dep.artifactId}/${dep.version}/${dep.artifactId}-${dep.version}.jar`;
}

function downloadIfNeeded(url, dest) {
  if (url.startsWith('file:')) {
    fs.createReadStream(url.substring('file:'.length)).pipe(fs.createWriteStream(dest));
  } else {
    request(url + '.sha1', (error, response, body) => {
      if (error) {
        throw error;
      } else if (response.statusCode !== 200) {
        throw `Unable to get file ${url}: ${response.statusCode} ${body}`;
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
      .on('finish', function() {
        let sha1 = this.read();
        if (expectedChecksum !== sha1) {
          console.info(`Checksum mismatch for '${dest}'. Will download it!`);
          request(url)
            .on('error', function(err) {
              throw error;
            })
            .on('response', function(response) {
              if (response.statusCode !== 200) {
                throw `Unable to get file ${url}: ${response.statusCode}`;
              }
            })
            .pipe(fs.createWriteStream(dest));
        }
      });
  }
}
