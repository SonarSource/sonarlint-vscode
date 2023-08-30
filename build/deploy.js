import log from 'fancy-log';
import { getPackageJSON } from 'fsUtils.js';
import path from 'path';
import dateformat from 'dateformat';
import { computeDependencyHashes, fileHashsum } from './hashes.js';
import jarDependencies from '../scripts/dependencies.json' assert { type: 'json' };
import globby from 'globby';
import fetch from 'node-fetch';

export function deployBuildInfo() {
  const packageJSON = getPackageJSON();
  const { version, name } = packageJSON;
  const buildNumber = process.env.BUILD_ID;
  const json = buildInfo(name, version, buildNumber);
  const headers = new Headers();
  headers.append('Content-Type', 'application/json');
  headers.append('Authorization',
    'Basic ' + Buffer.from(process.env.ARTIFACTORY_DEPLOY_USERNAME + ':' + process.env.ARTIFACTORY_DEPLOY_PASSWORD).toString('base64'));
  return fetch(`${process.env.ARTIFACTORY_URL}/api/build`, {
    method: 'PUT', body: json, headers: headers
  }).then(response => {
    if (!response.ok) {
      log.error(`Error ${response.status}`);
    }
    return response.json();
  });
}

export function deployVsix() {
}

function buildInfo(name, version, buildNumber) {
  const {
    CIRRUS_BUILD_ID, BUILD_ID, BUILD_REPOSITORY_NAME, BUILD_SOURCEVERSION, CIRRUS_BASE_BRANCH, GITHUB_BRANCH
  } = process.env;

  const dependencies = jarDependencies.map(dep => {
    const id = `${dep.groupId}:${dep.artifactId}:${dep.version}`;
    const { md5, sha1 } = computeDependencyHashes(dep.output);
    return {
      type: 'jar', id, md5, sha1
    };
  });

  const fixedBranch = (CIRRUS_BASE_BRANCH || GITHUB_BRANCH).replace('refs/heads/', '');

  const vsixPaths = globby.sync(path.join('*.vsix'));
  const additionalPaths = globby.sync(path.join('*{-cyclonedx.json,.asc}'));

  return {
    version: '1.0.1',
    name,
    number: buildNumber,
    started: dateformat(new Date(), 'yyyy-mm-dd\'T\'HH:MM:ss.lo'),
    url: `https://cirrus-ci.com/build/${CIRRUS_BUILD_ID}`,
    vcsRevision: BUILD_SOURCEVERSION,
    vcsUrl: `https://github.com/${BUILD_REPOSITORY_NAME}.git`,
    modules: [{
      id: `org.sonarsource.sonarlint.vscode:${name}:${version}`, properties: {
        artifactsToDownload: `org.sonarsource.sonarlint.vscode:${name}:vsix`
      }, artifacts: [...vsixPaths, ...additionalPaths].map(filePath => {
        const [sha1, md5] = fileHashsum(filePath);
        return {
          type: path.extname(filePath).slice(1), sha1, md5, name: path.basename(filePath)
        };
      }), dependencies
    }],
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
