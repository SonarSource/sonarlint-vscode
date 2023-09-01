const log = require('fancy-log');
const getPackageJSON = require('./fsUtils.js').getPackageJSON;
const path = require('path');
const dateformat = require('dateformat');
const computeDependencyHashes = require('./hashes.js').computeDependencyHashes;
const fileHashsum = require('./hashes.js').fileHashsum;
const jarDependencies = require('../scripts/dependencies.json');
const fs = require('fs');
const fetch = require('node-fetch');
const Headers = require('node-fetch').Headers;

async function deployBuildInfo() {
  const packageJSON = getPackageJSON();
  const { version, name } = packageJSON;
  const buildNumber = process.env.BUILD_ID;
  log.info(`${process.env.ARTIFACTORY_URL}/api/build`);
  log.info('Started with buildInfo');
  const json = await buildInfo(name, version, buildNumber);
  log.info('Finished with buildInfo');
  log.info(json);
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
  log.info('stringified build info coming');
  log.info(body);
  const response = await fetch(`${process.env.ARTIFACTORY_URL}/api/build`, {
    method: 'PUT',
    body: body,
    headers: headers
  });
  if (!response.ok) {
    log.error(`Error ${JSON.stringify(response)}`);
    log.error(`Error ${response.status}`);
    log.error(`Error ${response.text()}`);
  } else {
    log.info('after uploading buildinfo');
    log.info(response.text());
  }
}

async function deployVsix() {
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
  log.info(`Artifactory target URL: ${artifactoryTargetUrl}`);
  // TODO do we need to use merge-stream here?
  const { globbySync } = await import('globby');
  globbySync(path.join('*{.vsix,-cyclonedx.json,.asc}')).map(fileName => {
    const [sha1, md5] = fileHashsum(fileName);
    const fileReadStream = fs.createReadStream(fileName);
    atrifactoryUpload(fileReadStream, artifactoryTargetUrl, fileName, {
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

function atrifactoryUpload(readStream, url, fileName, options) {
  // TODO verify that the options.properties are not needed in the URL
  const destinationUrl = `${url}/${fileName}`;

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
        log.error(`Failed to upload ${fileName} to ${destinationUrl}, ${res.status}`);
      }
    })
    .catch(err => log.error(`Failed to upload ${fileName} to ${destinationUrl}, ${err}`));
}

async function buildInfo(name, version, buildNumber) {
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

  const { globbySync } = await import('globby');
  const vsixPaths = globbySync(path.join('*.vsix'));
  const additionalPaths = globbySync(path.join('*{-cyclonedx.json,.asc}'));

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
            type: path.extname(filePath).slice(1),
            sha1,
            md5,
            name: path.basename(filePath)
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

module.exports = {
  deployBuildInfo,
  deployVsix
};
