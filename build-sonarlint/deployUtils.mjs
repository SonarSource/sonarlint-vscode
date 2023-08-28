/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
import { error, info } from 'fancy-log';
import { getPackageJSON } from './fsUtils.mjs';
import { join, extname, basename } from 'path';
import dateformat from 'dateformat';
import { computeDependencyHashes, fileHashsum } from './hashes.mjs';
import jarDependencies from '../scripts/dependencies.json' assert { type: "json" } ;
import { createReadStream } from 'fs';
import fetch, { Headers } from 'node-fetch';
import { globbySync } from 'globby';

export async function deployBuildInfo() {
  info('Starting task "deployBuildInfo"');
  const packageJSON = getPackageJSON();
  const { version, name } = packageJSON;
  const buildNumber = process.env.BUILD_ID;
  const json = buildInfo(name, version, buildNumber);
  const headers = new Headers();
  headers.append('Content-Type', 'application/json');
  headers.append(
    'Authorization',
    'Basic ' +
      Buffer.from(`${process.env.ARTIFACTORY_DEPLOY_USERNAME}:${process.env.ARTIFACTORY_DEPLOY_PASSWORD}`).toString(
        'base64'
      )
  );
  const body = JSON.stringify(json);
  const response = await fetch(`${process.env.ARTIFACTORY_URL}/api/build`, {
    method: 'PUT',
    body,
    headers
  });
  if (!response.ok) {
    error(`Error ${response.status}`);
  }
}

export function deployVsix() {
  info('Starting task "deployVsix');
  const {
    ARTIFACTORY_URL,
    ARTIFACTORY_DEPLOY_REPO,
    ARTIFACTORY_DEPLOY_USERNAME,
    ARTIFACTORY_DEPLOY_PASSWORD,
    BUILD_SOURCEVERSION,
    GITHUB_BRANCH,
    BUILD_NUMBER,
    CIRRUS_BASE_BRANCH
  } = process.env;
  const packageJSON = getPackageJSON();
  const { version, name } = packageJSON;
  const packagePath = 'org/sonarsource/sonarlint/vscode';
  const artifactoryTargetUrl = `${ARTIFACTORY_URL}/${ARTIFACTORY_DEPLOY_REPO}/${packagePath}/${name}/${version}`;
  info(`Artifactory target URL: ${artifactoryTargetUrl}`);
  globbySync(join('*{.vsix,-cyclonedx.json,.asc}')).map(fileName => {
    const [sha1, md5] = fileHashsum(fileName);
    const fileReadStream = createReadStream(fileName);
    artifactoryUpload(fileReadStream, artifactoryTargetUrl, fileName, {
      username: ARTIFACTORY_DEPLOY_USERNAME,
      password: ARTIFACTORY_DEPLOY_PASSWORD,
      properties: {
        'vcs.revision': BUILD_SOURCEVERSION,
        'vcs.branch': CIRRUS_BASE_BRANCH || GITHUB_BRANCH,
        'build.name': name,
        'build.number': BUILD_NUMBER
      },
      request: {
        headers: {
          'X-Checksum-MD5': md5,
          'X-Checksum-Sha1': sha1
        }
      }
    });
  });
}

function artifactoryUpload(readStream, url, fileName, options) {
  let destinationUrl = `${url}/${fileName}`;
  destinationUrl += Object.keys(options.properties).reduce(function (str, key) {
    return `${str};${key}=${options.properties[key]}`;
  }, '');

  fetch(destinationUrl, {
    headers: {
      ...options.request.headers,
      Authorization: 'Basic ' + Buffer.from(`${options.username}:${options.password}`).toString('base64')
    },
    method: 'PUT',
    body: readStream
  })
    .then(res => {
      if (!res.ok) {
        error(`Failed to upload ${fileName} to ${destinationUrl}, ${res.status}`);
      }
    })
    .catch(err => error(`Failed to upload ${fileName} to ${destinationUrl}, ${err}`));
}

function buildInfo(name, version, buildNumber) {
  const {
    CIRRUS_BUILD_ID,
    BUILD_ID,
    BUILD_REPOSITORY_NAME,
    BUILD_SOURCEVERSION,
    CIRRUS_BASE_BRANCH,
    GITHUB_BRANCH
  } = process.env;

  const dependencies = jarDependencies.map(dep => {
    const id = `${dep.groupId}:${dep.artifactId}:${dep.version}`;
    const { md5, sha1 } = computeDependencyHashes(dep.output);
    return {
      type: 'jar',
      id,
      md5,
      sha1
    };
  });

  const fixedBranch = (CIRRUS_BASE_BRANCH || GITHUB_BRANCH).replace('refs/heads/', '');

  const vsixPaths = globbySync(join('*.vsix'));
  const additionalPaths = globbySync(join('*{-cyclonedx.json,.asc}'));

  return {
    version: '1.0.1',
    name,
    number: buildNumber,
    started: dateformat(new Date(), "yyyy-mm-dd'T'HH:MM:ss.lo"),
    url: `https://cirrus-ci.com/build/${CIRRUS_BUILD_ID}`,
    vcsRevision: BUILD_SOURCEVERSION,
    vcsUrl: `https://github.com/${BUILD_REPOSITORY_NAME}.git`,
    modules: [
      {
        id: `org.sonarsource.sonarlint.vscode:${name}:${version}`,
        properties: {
          artifactsToDownload: `org.sonarsource.sonarlint.vscode:${name}:vsix`
        },
        artifacts: [...vsixPaths, ...additionalPaths].map(filePath => {
          const [sha1, md5] = fileHashsum(filePath);
          return {
            type: extname(filePath).slice(1),
            sha1,
            md5,
            name: basename(filePath)
          };
        }),
        dependencies
      }
    ],
    properties: {
      'java.specification.version': '1.8', // Workaround for https://jira.sonarsource.com/browse/RA-115
      'buildInfo.env.PROJECT_VERSION': version,
      'buildInfo.env.ARTIFACTORY_DEPLOY_REPO': 'sonarsource-public-qa',
      'buildInfo.env.BUILD_BUILDID': BUILD_ID,
      'buildInfo.env.BUILD_SOURCEVERSION': BUILD_SOURCEVERSION,
      'buildInfo.env.GITHUB_BRANCH': fixedBranch,
      'buildInfo.env.GIT_SHA1': BUILD_SOURCEVERSION
    }
  };
}
