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
const exec = require('child_process').exec;
const { getSignature } = require('./scripts/gulp-sign.js');
const path = require('path');
const globby = require('globby');
const mergeStream = require('merge-stream');
//...

const LATEST_JRE = 17;
const UNIVERSAL_PLATFORM = 'universal';
// const TARGETED_PLATFORMS = ['win32-x64', 'linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64'];
const TARGETED_PLATFORMS = ['win32-x64'];
const allPlatforms = {};
[...TARGETED_PLATFORMS, UNIVERSAL_PLATFORM].forEach(platform => {
  allPlatforms[platform] = {
    fileName: '',
    hashes: {
      'md5': '',
      'sha1': ''
    }
  };
});

gulp.task('clean:vsix', () => del(['*.vsix', 'server', 'out', 'out-cov']));

gulp.task(
  'clean',
  gulp.parallel('clean:vsix', () => del(['server', 'out', 'out-cov']))
);

gulp.task('cycloneDx',function (cb) {
  const packageJSON = getPackageJSON();
  const version = packageJSON.version;
  const cycloneDxCommand = `npm run cyclonedx-run -- -d --output sonarlint-vscode-${version}.sbom-cyclonedx.json`;
  exec(cycloneDxCommand, (err, stdout, stderr) => {
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

gulp.task('package', async (done) => {
  await Promise.all(TARGETED_PLATFORMS.map(async platform => {
    await downloadJre(platform, LATEST_JRE, done);
    await vsce.createVSIX({target: platform});
  }));
  await vsce.createVSIX();
  done();
});

function getPackageJSON() {
  return JSON.parse(fs.readFileSync('package.json').toString());
}

gulp.task('compute-vsix-hashes', function (done) {
  const version = getPackageJSON().version;
  const tasks = Object.keys(allPlatforms).map(platform => () => hashsum(platform, version));

  return gulp.series(...tasks, (seriesDone) => {
    seriesDone();
    done();
  })();
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
  // console.log(`Artifactory target URL: ${artifactoryTargetUrl}`);
  // return gulp.series(Object.keys(allPlatforms).map(platform =>
  //     gulp.src(allPlatforms[platform].fileName)
  //         .pipe(
  //             artifactoryUpload({
  //               url: artifactoryTargetUrl,
  //               username: ARTIFACTORY_DEPLOY_USERNAME,
  //               password: ARTIFACTORY_DEPLOY_PASSWORD,
  //               properties: {
  //                 'vcs.revision': BUILD_SOURCEVERSION,
  //                 'vcs.branch': SYSTEM_PULLREQUEST_TARGETBRANCH || BUILD_SOURCEBRANCH,
  //                 'build.name': name,
  //                 'build.number': BUILD_BUILDID
  //               },
  //               request: {
  //                 headers: {
  //                   'X-Checksum-MD5': allPlatforms[platform].hashes.md5,
  //                   'X-Checksum-Sha1': allPlatforms[platform].hashes.sha1
  //                 }
  //               }
  //             })
  //         )));
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

gulp.task('clean-jre', (done) => {
  if (fse.existsSync('./jre')) {
    fse.removeSync('./jre');
  }
  done();
});

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
  if (fse.existsSync('./jre')) {
    fse.removeSync('./jre');
  }

  const platformMapping = {
    'linux-arm64': 'linux-aarch64',
    'linux-x64': 'linux-x86_64',
    'darwin-arm64': 'macosx-aarch64',
    'darwin-x64': 'macosx-x86_64',
    'win32-x64': 'win32-x86_64'
  };

  if (!targetPlatform || !Object.keys(platformMapping).includes(targetPlatform)) {
    console.log('[Error] download_jre failed, please specify a valid target platform via --target argument. ' +
        'Here are the supported platform list:');
    for (const platform of Object.keys(platformMapping)) {
      console.log(platform);
    }
    return;
  }

  console.log(`Downloading justj JRE ${javaVersion} for the platform ${targetPlatform} ...`);

  const manifestUrl = `https://download.eclipse.org/justj/jres/${javaVersion}/downloads/latest/justj.manifest`;
  // Download justj.manifest file
  const manifest = await new Promise(function (resolve, reject) {
    request.get(manifestUrl, function (err, response, body) {
      if (err || response.statusCode >= 400) {
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
  await new Promise(function (resolve, reject) {
    download(jreDownloadUrl)
        .on('error', reject)
        .pipe(decompress({strip: 0}))
        .pipe(gulp.dest('./jre/' + jreVersionLabel))
        .on('end', resolve);
  });

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
      (error, _response, _body) => {
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
  const tasks = ['clean', 'update-version'];
  TARGETED_PLATFORMS.forEach(
      platform => tasks.push(gulp.series(downloadJreAndInstallVsixForPlatform(platform)))
  );
  tasks.push('clean-jre');
  tasks.push(gulp.series(vsce.createVSIX));
  tasks.push(gulp.series('compute-vsix-hashes', 'deploy-buildinfo', 'deploy-vsix'));

  return gulp.series(...tasks, (seriesDone) => {
    seriesDone();
    done();
  })();
};

gulp.task('sign', () => {
  return gulp.src(path.join('*{.vsix,-cyclonedx.json}'))
  .pipe(getSignature({
    keyPath: process.env.SIGN_KEY,
    passphrase: process.env.PGP_PASSPHRASE
  }))
  .pipe(gulp.dest('./'));
});

gulp.task(
  'deploy',
  gulp.series(
    'clean',
    'update-version',
    'cycloneDx',
    vsce.createVSIX,
    'compute-vsix-hashes',
    'sign',
    'deploy-buildinfo',
    'deploy-vsix'
  )
);

// gulp.task('deploy', deployAllPlatformsSeries);

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

  const artifacts = Object.keys(allPlatforms).map(platform => (
    {
      type: 'vsix',
      sha1: allPlatforms[platform].hashes.sha1,
      md5: allPlatforms[platform].hashes.md5,
      name: allPlatforms[platform].fileName
    }
  ));

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

function hashsum(platform, version) {
  function processFile(file, _encoding, callback) {
    updateHashes(platform, file);
    this.push(file);
    callback();
  }

  allPlatforms[platform].fileName = platform === UNIVERSAL_PLATFORM ?
      `sonarlint-vscode-${version}.vsix` :
      `sonarlint-vscode-${platform}-${version}.vsix`;
  return gulp.src(allPlatforms[platform].fileName).pipe(through.obj(processFile));
}

function updateHashes(platform, file) {
  if (file.isNull()) {
    return;
  }
  if (file.isStream()) {
    log.warn('Streams not supported');
    return;
  }
  updateBinaryHashes(file.contents, allPlatforms[platform].hashes);
}

function computeDependencyHashes(dependencyLocation) {
  const dependencyContents = fs.readFileSync(dependencyLocation);
  const dependencyHashes = {'md5': '', 'sha1': ''};
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
