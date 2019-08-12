'use strict';
const gulp = require('gulp');
const download = require('gulp-download');
const rename = require('gulp-rename');
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
const sonarqubeScanner = require('sonarqube-scanner');
//...

gulp.task('clean', () => {
  del.sync('*.vsix');
  del.sync('server');
});

gulp.task('update-version', function() {
  const buildNumber = process.env.TRAVIS_BUILD_NUMBER;
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

gulp.task('package', ['update-version'], vsce.createVSIX);

function getPackageJSON() {
  return JSON.parse(fs.readFileSync('package.json'));
}

const hashes = {
  sha1: '',
  md5: ''
};

gulp.task('compute-hashes', ['package'], function() {
  return gulp.src('*.vsix').pipe(hashsum());
});

gulp.task('deploy-vsix', ['package', 'compute-hashes'], function() {
  if (process.env.TRAVIS_BRANCH !== 'master') {
    gutil.log('Not on master, skip deploy-vsix');
    return Promise.resolve();
  }
  const {
    ARTIFACTORY_URL,
    ARTIFACTORY_DEPLOY_REPO,
    ARTIFACTORY_DEPLOY_USERNAME,
    ARTIFACTORY_DEPLOY_PASSWORD,
    TRAVIS_COMMIT,
    TRAVIS_BRANCH,
    TRAVIS_BUILD_NUMBER
  } = process.env;
  const packageJSON = getPackageJSON();
  const { version, name } = packageJSON;
  const artifactoryTargetUrl =
    `${ARTIFACTORY_URL}/${ARTIFACTORY_DEPLOY_REPO}/org/sonarsource/sonarlint/vscode/${name}/${version}`;
  return gulp
    .src('*.vsix')
    .pipe(
      artifactoryUpload({
        url: artifactoryTargetUrl,
        username: ARTIFACTORY_DEPLOY_USERNAME,
        password: ARTIFACTORY_DEPLOY_PASSWORD,
        properties: {
          'vcs.revision': TRAVIS_COMMIT,
          'vcs.branch': TRAVIS_BRANCH,
          'build.name': name,
          'build.number': TRAVIS_BUILD_NUMBER
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
});

gulp.task('deploy-buildinfo', ['compute-hashes'], function() {
  if (process.env.TRAVIS_BRANCH !== 'master') {
    gutil.log('Not on master, skip deploy-buildinfo');
    return Promise.resolve();
  }
  const packageJSON = getPackageJSON();
  const { version, name } = packageJSON;
  const buildNumber = process.env.TRAVIS_BUILD_NUMBER;
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
});

gulp.task('deploy', ['deploy-buildinfo', 'deploy-vsix'], function() {});

function snapshotVersion() {
  const buildNumber = process.env.TRAVIS_BUILD_NUMBER;
  const packageJSON = getPackageJSON();
  const version = packageJSON.version;
  const buildIdx = version.lastIndexOf('-');
  if (buildIdx >= 0 && buildNumber) {
    return version.substr(0, buildIdx) + '-SNAPSHOT';
  }
  return version;
}

gulp.task('sonarqube', callback => {
  if (process.env.TRAVIS_BRANCH === 'master' && process.env.TRAVIS_PULL_REQUEST === 'false') {
    runSonnarQubeScanner(callback, {
      'sonar.analysis.sha1': process.env.TRAVIS_COMMIT
    });
  } else if (process.env.TRAVIS_PULL_REQUEST !== 'false') {
    runSonnarQubeScanner(callback, {
      'sonar.pullrequest.branch': process.env.TRAVIS_PULL_REQUEST_BRANCH,
      'sonar.pullrequest.base': process.env.TRAVIS_BRANCH,
      'sonar.pullrequest.key': process.env.TRAVIS_PULL_REQUEST,
      'sonar.pullrequest.provider': 'github',
      'sonar.pullrequest.github.repository': process.env.TRAVIS_REPO_SLUG,
      'sonar.analysis.prNumber': process.env.TRAVIS_PULL_REQUEST,
      'sonar.analysis.sha1': process.env.TRAVIS_PULL_REQUEST_SHA
    });
  }
});

function runSonnarQubeScanner(callback, options = {}) {
  const commonOptions = {
    'sonar.projectKey': 'org.sonarsource.sonarlint.vscode:sonarlint-vscode',
    'sonar.projectName': 'SonarLint for VSCode',
    'sonar.projectVersion': snapshotVersion(),
    'sonar.exclusions': 'build/**, out/**, coverage/**, node_modules/**, **/node_modules/**',
    'sonar.typescript.lcov.reportPaths': 'coverage/lcov.info',
    'sonar.coverage.exclusions': 'gulpfile.js, build/**, config/**, coverage/**, scripts/**',
    'sonar.analysis.buildNumber': process.env.TRAVIS_BUILD_NUMBER,
    'sonar.analysis.pipeline': process.env.TRAVIS_BUILD_NUMBER,
    'sonar.analysis.repository': process.env.TRAVIS_REPO_SLUG
  };
  sonarqubeScanner(
    {
      serverUrl: process.env.SONAR_HOST_URL,
      token: process.env.SONAR_TOKEN,
      options: {
        ...commonOptions,
        ...options
      }
    },
    callback
  );
}

function buildInfo(name, version, buildNumber, hashes) {
  return {
    version: '1.0.1',
    name,
    number: buildNumber,
    started: dateformat(new Date(), "yyyy-mm-dd'T'HH:MM:ss.lo"),
    url: process.env.CI_BUILD_URL,
    vcsRevision: process.env.TRAVIS_COMMIT,
    vcsUrl: `https://github.com/${process.env.TRAVIS_REPO_SLUG}.git`,
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
      'buildInfo.env.TRAVIS_COMMIT': process.env.TRAVIS_COMMIT
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
