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
const decompress = require('gulp-decompress');
const download = require('gulp-download');
const fse = require('fs-extra');
const argv = require('minimist')(process.argv.slice(2));
const path = require('path');
const url = require('url');
const dateformat = require('dateformat');
const jarDependencies = require('./scripts/dependencies.json');
//...

const LATEST_JRE = 17;
const platforms = ['win32-x64', 'linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64'];


gulp.task('clean:vsix', () => del(['*.vsix', 'server', 'out', 'out-cov']));

gulp.task(
  'clean',
  gulp.parallel('clean:vsix', () => del(['server', 'out', 'out-cov']))
);

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

gulp.task('package', async (done) => {
  for(const i in platforms) {
    const platform = platforms[i];
    await downloadJre(platform, LATEST_JRE, done);
    await vsce.createVSIX({target: platform});
  }
  await vsce.createVSIX();
  done();
});

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
  console.log(`Artifactory target URL: ${artifactoryTargetUrl}`);
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
    .on('error', log.error);
});

const cleanJre = (done) => {
  if (fse.existsSync('./jre')) {
    fse.removeSync('./jre');
  }
  done();
};

gulp.task('clean-jre', cleanJre);

/**
 * Usage:
 * npx gulp download_jre    // Download the latest JRE for the platform of the current running machine.
 * npx gulp download_jre --target darwin-x64 --javaVersion 17  // Download the specified JRE for the specified platform.
 *
 * Supported platforms:
 *  win32-x64,
 *  linux-x64,
 *  linux-arm64,
 *  darwin-x64,
 *  darwin-arm64
 */
gulp.task('download_jre', async (done) => {
  const targetPlatform = argv.target || `${process.platform}-${process.arch}`;
  const javaVersion = (!argv.javaVersion || argv.javaVersion === 'latest') ? LATEST_JRE : argv.javaVersion;
  await downloadJre(targetPlatform, javaVersion, done);
  done();
});



async function downloadJre(targetPlatform, javaVersion, done) {
  cleanJre(done);

  const platformMapping = {
    'linux-arm64': 'linux-aarch64',
    'linux-x64': 'linux-x86_64',
    'darwin-arm64': 'macosx-aarch64',
    'darwin-x64': 'macosx-x86_64',
    'win32-x64': 'win32-x86_64'
  };

  if (targetPlatform && Object.keys(platformMapping).includes(targetPlatform)) {
    console.log(`Downloading justj JRE ${javaVersion} for the platform ${targetPlatform} ...`);

    const manifestUrl = `https://download.eclipse.org/justj/jres/${javaVersion}/downloads/latest/justj.manifest`;
    // Download justj.manifest file
    const manifest = await new Promise(function(resolve, reject) {
      request.get(manifestUrl, function(err, response, body) {
        if(err || response.statusCode >= 400) {
          reject(err || `${response.statusCode} returned from ${manifestUrl}`);
        } else {
          resolve(String(body));
        }
      });
    });

    if (!manifest) {
      done(new Error(`Failed to download justj.manifest, please check if the link ${manifestUrl} is valid.`));
      return;
    }

    /**
     * Here are the contents for a sample justj.manifest file:
     * ../20211012_0921/org.eclipse.justj.openjdk.hotspot.jre.full.stripped-17-linux-aarch64.tar.gz
     * ../20211012_0921/org.eclipse.justj.openjdk.hotspot.jre.full.stripped-17-linux-x86_64.tar.gz
     * ../20211012_0921/org.eclipse.justj.openjdk.hotspot.jre.full.stripped-17-macosx-aarch64.tar.gz
     * ../20211012_0921/org.eclipse.justj.openjdk.hotspot.jre.full.stripped-17-macosx-x86_64.tar.gz
     * ../20211012_0921/org.eclipse.justj.openjdk.hotspot.jre.full.stripped-17-win32-x86_64.tar.gz
     */
    const javaPlatform = platformMapping[targetPlatform];
    const list = manifest.split(/\r?\n/);
    const jreIdentifier = list.find((value) => {
      return value.indexOf('org.eclipse.justj.openjdk.hotspot.jre.full.stripped') >= 0
          && value.indexOf(javaPlatform) >= 0;
    });

    if (!jreIdentifier) {
      done(new Error(`justj doesn't support the jre ${javaVersion} for the platform ${javaPlatform}
      (${targetPlatform}), please refer to the link ${manifestUrl} for the supported platforms.`));
      return;
    }

    const jreDownloadUrl = `https://download.eclipse.org/justj/jres/${javaVersion}/downloads/latest/${jreIdentifier}`;
    const parsedDownloadUrl = url.parse(jreDownloadUrl);
    const jreFileName = path.basename(parsedDownloadUrl.pathname)
        .replace(/[\.7z|\.bz2|\.gz|\.rar|\.tar|\.zip|\.xz]*$/, '');
    const idx = jreFileName.indexOf('-');
    const jreVersionLabel = idx >= 0 ? jreFileName.substring(idx + 1) : jreFileName;
    // Download justj JRE.
    await new Promise(function(resolve, reject) {
      download(jreDownloadUrl)
          .on('error', reject)
          .pipe(decompress({strip: 0}))
          .pipe(gulp.dest('./jre/' + jreVersionLabel))
          .on('end', resolve);
    });
  } else {
    console.log('[Error] download_jre failed, please specify a valid target platform via --target argument. ' +
        'Here are the supported platform list:');
    for (const platform of Object.keys(platformMapping)) {
      console.log(platform);
    }
  }

}

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

function downloadJreAndInstallVsixForPlatform(platform) {
  return function (done) {
    const downloadJreTask = () => downloadJre(platform, LATEST_JRE, done);
    const createVsixTask = () => vsce.createVSIX({target: platform});
    const tasks = [downloadJreTask, createVsixTask];
    return gulp.series(...tasks, (seriesDone) => {
      seriesDone();
      done();
    })();
  };
}

const deployAllPlatformsSeries = (done) => {
  const tasks = platforms.map((platform) =>{
    return (donePlatform) => {
      gulp.series('clean', 'update-version', downloadJreAndInstallVsixForPlatform(platform),
          'compute-vsix-hashes', 'deploy-buildinfo', 'deploy-vsix', 'clean-jre');
      donePlatform();
    };
  });
  tasks[platforms.length] = (universalDone) => {
    gulp.series('clean', 'update-version', vsce.createVSIX,
        'compute-vsix-hashes', 'deploy-buildinfo', 'deploy-vsix', 'clean');
    universalDone();
  };
  return gulp.series(...tasks, (seriesDone) => {
    seriesDone();
    done();
  })();
};

gulp.task('deploy', deployAllPlatformsSeries);

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
        ],
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
