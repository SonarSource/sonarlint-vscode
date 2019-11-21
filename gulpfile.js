/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2019 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
const gulp = require('gulp');
const artifactoryUpload = require('gulp-artifactory-upload');
const del = require('del');
const vsce = require('vsce');
const gutil = require('gulp-util');
const fs = require('fs');
const crypto = require('crypto');
const through = require('through2');
const request = require('request');
const bump = require('gulp-bump');
const dateformat = require('dateformat');
//...

gulp.task('clean', () => del(['*.vsix', 'server', 'out', 'out-cov']));

gulp.task('update-version', function() {
  const buildNumber = process.env.BUILD_BUILDID;
  const packageJSON = getPackageJSON();
  const version = packageJSON.version;
  if (version.endsWith('-SNAPSHOT') && buildNumber) {
    return gulp
      .src('./package.json')
      .pipe(bump({ version: version.replace('-SNAPSHOT', '-build.' + buildNumber) }))
      .pipe(gulp.dest('./'));
  } else {
    gutil.log(`Not modifying version ${version} with build number ${buildNumber}`);
    return Promise.resolve();
  }
});

gulp.task('package', gulp.series('update-version', vsce.createVSIX));

function getPackageJSON() {
  return JSON.parse(fs.readFileSync('package.json'));
}

const hashes = {
  sha1: '',
  md5: ''
};

gulp.task(
  'compute-hashes',
  gulp.series('package', function() {
    return gulp.src('*.vsix').pipe(hashsum());
  })
);

gulp.task(
  'deploy-vsix',
  gulp.series('package', 'compute-hashes', function() {
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
    const artifactoryTargetUrl = `${ARTIFACTORY_URL}/${ARTIFACTORY_DEPLOY_REPO}/org/sonarsource/sonarlint/vscode/${name}/${version}`;
    return gulp
      .src('*.vsix')
      .pipe(
        artifactoryUpload({
          url: artifactoryTargetUrl,
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
              'X-Checksum-MD5': hashes.md5,
              'X-Checksum-Sha1': hashes.sha1
            }
          }
        })
      )
      .on('error', gutil.log);
  })
);

gulp.task(
  'deploy-buildinfo',
  gulp.series('compute-hashes', function() {
    const packageJSON = getPackageJSON();
    const { version, name } = packageJSON;
    const buildNumber = process.env.BUILD_BUILDID;
    return request
      .put(
        {
          url: process.env.ARTIFACTORY_URL + '/api/build',
          json: buildInfo(name, version, buildNumber, hashes)
        },
        function(error, response, body) {
          if (error) {
            gutil.log('error:', error);
          }
        }
      )
      .auth(process.env.ARTIFACTORY_DEPLOY_USERNAME, process.env.ARTIFACTORY_DEPLOY_PASSWORD, true);
  })
);

gulp.task('deploy', gulp.series('deploy-buildinfo', 'deploy-vsix'));

function snapshotVersion() {
  const buildNumber = process.env.BUILD_BUILDID;
  const packageJSON = getPackageJSON();
  const version = packageJSON.version;
  const buildIdx = version.lastIndexOf('-');
  if (buildIdx >= 0 && buildNumber) {
    return version.substr(0, buildIdx) + '-SNAPSHOT';
  }
  return version;
}

function buildInfo(name, version, buildNumber, hashes) {
  const { SYSTEM_TEAMPROJECTID, BUILD_BUILDID, BUILD_REPOSITORY_NAME, BUILD_SOURCEVERSION } = process.env;
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
        artifacts: [
          {
            type: 'vsix',
            sha1: hashes.sha1,
            md5: hashes.md5,
            name: `${name}-${version}.vsix`
          }
        ]
      }
    ],
    properties: {
      'java.specification.version': '1.8', // Workaround for https://jira.sonarsource.com/browse/RA-115
      'buildInfo.env.PROJECT_VERSION': version,
      'buildInfo.env.ARTIFACTORY_DEPLOY_REPO': 'sonarsource-public-qa',
      'buildInfo.env.BUILD_BUILDID': BUILD_BUILDID
    }
  };
}

function hashsum() {
  function processFile(file, encoding, callback) {
    if (file.isNull()) {
      return;
    }
    if (file.isStream()) {
      gutil.log('Streams not supported');
      return;
    }
    for (let algo in hashes) {
      if (hashes.hasOwnProperty(algo)) {
        hashes[algo] = crypto
          .createHash(algo)
          .update(file.contents, 'binary')
          .digest('hex');
        gutil.log(`Computed ${algo}: ${hashes[algo]}`);
      }
    }

    this.push(file);
    callback();
  }

  return through.obj(processFile);
}
