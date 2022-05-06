/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
const gulp = require('gulp');
const artifactoryUpload = require('gulp-artifactory-upload');
const del = require('del');
const vsce = require('vsce');
const log = require('fancy-log');
const fs = require('fs');
const crypto = require('crypto');
const through = require('through2');
const request = require('request');
const bump = require('gulp-bump');
const dateformat = require('dateformat');
const jarDependencies = require('./scripts/dependencies.json');
const exec = require('child_process').exec;
const { addSignature, getSignature } = require('./scripts/gulp-sign.js');
const path = require('path');
const globby = require('globby');
const mergeStream = require('merge-stream');
//...

gulp.task('clean:vsix', () => del(['*.vsix', 'server', 'out', 'out-cov']));

gulp.task(
  'clean',
  gulp.parallel('clean:vsix', () => del(['server', 'out', 'out-cov']))
);

gulp.task('cycloneDx',function (cb) {
  const packageJSON = getPackageJSON();
  const version = packageJSON.version;
  exec(`npm run cyclonedx-run -- -d --output sonarlint-vscode-${version}.sbom-cyclonedx.json`, function (err, stdout, stderr) {
    console.log(stdout);
    console.log(stderr);
    cb(err);
  });
});


gulp.task('update-version', function () {
  const buildNumber = process.env.BUILD_BUILDID;
  const packageJSON = getPackageJSON();
  const version = packageJSON.version;
  if (version.endsWith('-SNAPSHOT') && buildNumber) {
    return gulp
      .src('./package.json')
      .pipe(bump({ version: version.replace('-SNAPSHOT', `+${buildNumber}`) }))
      .pipe(gulp.dest('./'));
  } else {
    log.info(`Not modifying version ${version} with build number ${buildNumber}`);
    return Promise.resolve();
  }
});

gulp.task('package', gulp.series('clean', 'update-version', vsce.createVSIX));

function getPackageJSON() {
  return JSON.parse(fs.readFileSync('package.json').toString());
}

const hashes = {
  sha1: '',
  md5: ''
};

gulp.task('compute-vsix-hashes', function () {
  return gulp.src('*.vsix').pipe(hashsum());
});

gulp.task('deploy-vsix', function () {
  const {
    ARTIFACTORY_URL,
    ARTIFACTORY_DEPLOY_REPO,
    ARTIFACTORY_DEPLOY_USERNAME,
    ARTIFACTORY_DEPLOY_PASSWORD,
    BUILD_SOURCEVERSION,
    BUILD_SOURCEBRANCH,
    BUILD_BUILDID,
    SYSTEM_PULLREQUEST_TARGETBRANCH
  } = process.env;
  const packageJSON = getPackageJSON();
  const { version, name } = packageJSON;
  const packagePath = 'org/sonarsource/sonarlint/vscode';
  const artifactoryTargetUrl = `${ARTIFACTORY_URL}/${ARTIFACTORY_DEPLOY_REPO}/${packagePath}/${name}/${version}`;
  return mergeStream(
    globby.sync(path.join('*{.vsix,-cyclonedx.json,.asc}')).map(filePath => {
      const [sha1, md5] = fileHashsum(filePath);
      return gulp
        .src(filePath)
        .pipe(
          artifactoryUpload({
            url:artifactoryTargetUrl,
            username: ARTIFACTORY_DEPLOY_USERNAME,
            password: ARTIFACTORY_DEPLOY_PASSWORD,
            properties: {
              'vcs.revision': BUILD_SOURCEVERSION,
              'vcs.branch': SYSTEM_PULLREQUEST_TARGETBRANCH || BUILD_SOURCEBRANCH,
              'build.name': name,
              'build.number': BUILD_BUILDID
            },
            request: {
              headers: {
                'X-Checksum-MD5': md5,
                'X-Checksum-Sha1': sha1
              }
            }
          })
        )
        .on('error', log.error);
    })
  );
});

gulp.task('deploy-buildinfo', function (done) {
  const packageJSON = getPackageJSON();
  const { version, name } = packageJSON;
  const buildNumber = process.env.BUILD_BUILDID;
  const json = buildInfo(name, version, buildNumber);
  return request
    .put(
      {
        url: `${process.env.ARTIFACTORY_URL}/api/build`,
        json
      },
      function (error, response, body) {
        if (error) {
          log.error('error:', error);
        }
        done();
      }
    )
    .auth(process.env.ARTIFACTORY_DEPLOY_USERNAME, process.env.ARTIFACTORY_DEPLOY_PASSWORD, true);
});

gulp.task('sign', () => {  
  return gulp.src(path.join('*{.vsix,-cyclonedx.json}'))
  .pipe(getSignature({
    keyPath: process.env.SIGN_KEY,
    passphrase: process.env.PGP_PASSPHRASE
  }))
  .pipe(gulp.dest('./'))
});

gulp.task(
  'deploy',
  gulp.series('clean', 'update-version', 'cycloneDx', vsce.createVSIX, 'compute-vsix-hashes', 'sign', 'deploy-buildinfo', 'deploy-vsix')
);

function buildInfo(name, version, buildNumber) {
  const {
    SYSTEM_TEAMPROJECTID,
    BUILD_BUILDID,
    BUILD_REPOSITORY_NAME,
    BUILD_SOURCEVERSION,
    SYSTEM_PULLREQUEST_TARGETBRANCH,
    BUILD_SOURCEBRANCH
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

  const fixedBranch = (SYSTEM_PULLREQUEST_TARGETBRANCH || BUILD_SOURCEBRANCH).replace('refs/heads/', '');
  const vsixPaths = globby.sync(path.join('*.vsix'));
  const additionalPaths = globby.sync(path.join('*{-cyclonedx.json,.asc}'));

  return {
    version: '1.0.1',
    name,
    number: buildNumber,
    started: dateformat(new Date(), "yyyy-mm-dd'T'HH:MM:ss.lo"),
    url: `https://dev.azure.com/sonarsource/${SYSTEM_TEAMPROJECTID}/_build/results?buildId=${BUILD_BUILDID}&view=logs`,
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
      'buildInfo.env.BUILD_BUILDID': BUILD_BUILDID,
      'buildInfo.env.BUILD_SOURCEVERSION': BUILD_SOURCEVERSION,
      'buildInfo.env.GITHUB_BRANCH': fixedBranch,
      'buildInfo.env.GIT_SHA1': BUILD_SOURCEVERSION
    }
  };
}

function fileHashsum(filePath) {
  const fileContent = fs.readFileSync(filePath);
  return ['sha1', 'md5'].map(algo => {
    const hash = crypto
      .createHash(algo)
      .update(fileContent, 'binary')
      .digest('hex');
    console.log(`Computed "${path.basename(filePath)}" ${algo}: ${hash}`);
    return hash;
  });
}
exports.fileHashsum = fileHashsum;

function hashsum() {
  function processFile(file, encoding, callback) {
    updateHashes(file);
    this.push(file);
    callback();
  }

  return through.obj(processFile);
}

function updateHashes(file) {
  if (file.isNull()) {
    return;
  }
  if (file.isStream()) {
    log.warn('Streams not supported');
    return;
  }
  updateBinaryHashes(file.contents, hashes);
}

function computeDependencyHashes(dependencyLocation) {
  const dependencyContents = fs.readFileSync(dependencyLocation);
  const dependencyHashes = Object.assign({}, hashes);
  updateBinaryHashes(dependencyContents, dependencyHashes);
  return dependencyHashes;
}

function updateBinaryHashes(binaryContent, hashesObject) {
  for (const algo in hashesObject) {
    if (hashesObject.hasOwnProperty(algo)) {
      hashesObject[algo] = crypto.createHash(algo).update(binaryContent, 'binary').digest('hex');
      log.info(`Computed ${algo}: ${hashesObject[algo]}`);
    }
  }
}
