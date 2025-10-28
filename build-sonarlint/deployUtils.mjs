/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
import { error, info } from 'fancy-log';
import { getPackageJSON } from './fsUtils.mjs';
import { basename, extname, join } from 'path';
import dateformat from 'dateformat';
import { computeDependencyHashes, fileHashsum } from './hashes.mjs';
import { createReadStream } from 'fs';
import { globbySync } from 'globby';

export async function deployBuildInfo() {
  info('Starting task "deployBuildInfo"');
  const packageJSON = getPackageJSON();
  const { version, name, jarDependencies } = packageJSON;
  const buildNumber = process.env.BUILD_NUMBER;
  const json = buildInfo(name, version, buildNumber, jarDependencies);
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
    headers,
    duplex: 'half'
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
    GITHUB_SHA,
    GITHUB_BRANCH,
    BUILD_NUMBER,
    GITHUB_BASE_REF
  } = process.env;
  const packageJSON = getPackageJSON();
  const { version, name } = packageJSON;
  const packagePath = 'org/sonarsource/sonarlint/vscode';
  const artifactoryTargetUrl = `${ARTIFACTORY_URL}/${ARTIFACTORY_DEPLOY_REPO}/${packagePath}/${name}/${version}+${BUILD_NUMBER}`;
  info(`Artifactory target URL: ${artifactoryTargetUrl}`);
  globbySync(join('*{.vsix,-cyclonedx.json,.asc}')).map(fileName => {
    const [sha1, md5] = fileHashsum(fileName);
    const fileReadStream = createReadStream(fileName);
    artifactoryUpload(fileReadStream, artifactoryTargetUrl, fileName, {
      username: ARTIFACTORY_DEPLOY_USERNAME,
      password: ARTIFACTORY_DEPLOY_PASSWORD,
      properties: {
        'vcs.revision': GITHUB_SHA,
        'vcs.branch': GITHUB_BASE_REF || GITHUB_BRANCH,
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
    body: readStream,
    duplex: 'half'
  })
    .then(res => {
      if (!res.ok) {
        error(`Failed to upload ${fileName} to ${destinationUrl}, ${res.status}`);
      }
    })
    .catch(err => error(`Failed to upload ${fileName} to ${destinationUrl}, ${err}`));
}

function buildInfo(name, version, buildNumber, jarDependencies) {
  const { GITHUB_RUN_ID, BUILD_NUMBER, GITHUB_REPOSITORY, GITHUB_SHA, GITHUB_BASE_REF, GITHUB_BRANCH } = process.env;

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

  const fixedBranch = (GITHUB_BASE_REF || GITHUB_BRANCH).replace('refs/heads/', '');

  const vsixPaths = globbySync(join('*.vsix'));
  const additionalPaths = globbySync(join('*{-cyclonedx.json,.asc}'));

  return {
    version: '1.0.1',
    name,
    number: buildNumber,
    started: dateformat(new Date(), "yyyy-mm-dd'T'HH:MM:ss.lo"),
    url: `https://github.com/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`,
    vcsRevision: GITHUB_SHA,
    vcsUrl: `https://github.com/${GITHUB_REPOSITORY}.git`,
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
      'buildInfo.env.BUILD_BUILDID': BUILD_NUMBER,
      'buildInfo.env.BUILD_SOURCEVERSION': GITHUB_SHA,
      'buildInfo.env.GITHUB_BRANCH': fixedBranch,
      'buildInfo.env.GIT_SHA1': GITHUB_SHA
    }
  };
}
