'use strict';
const gulp = require('gulp');
const download = require('gulp-download');
const rename = require("gulp-rename");
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

gulp.task('clean', ()=>
{
    del.sync('*.vsix');
    del.sync('server');
});

gulp.task('update-version', function() {
    var buildNumber = process.env.TRAVIS_BUILD_NUMBER;
    var packageJSON = getPackageJSON();
    var version = packageJSON.version;
    if (version.endsWith('-SNAPSHOT') && buildNumber) {
        return gulp.src('./package.json')
            .pipe(bump({version: version.replace('-SNAPSHOT', '-build.' + buildNumber)}))
            .pipe(gulp.dest('./'));
    }  
});

gulp.task('package', ['update-version'], () => {
    return vsce.createVSIX();
});

function getPackageJSON() {
    return JSON.parse(fs.readFileSync('package.json'));
}

var hashes = {
        sha1: '',
        md5: ''
    }

gulp.task( 'compute-hashes', ['package'], function() {
    return gulp.src( '*.vsix' )
        .pipe( hashsum() );
} );
 
gulp.task( 'deploy-vsix', ['package', 'compute-hashes'], function() {
    if (process.env.TRAVIS_BRANCH != 'master') {
        gutil.log('Not on master, skip deploy-vsix');
        return;
    }
    var packageJSON = getPackageJSON();
    var version = packageJSON.version;
    var name = packageJSON.name;
    var buildNumber = process.env.TRAVIS_BUILD_NUMBER;
    return gulp.src( '*.vsix' )
        .pipe( artifactoryUpload( {
                url: process.env.ARTIFACTORY_URL + '/' + process.env.ARTIFACTORY_DEPLOY_REPO + '/org/sonarsource/sonarlint/vscode/' + name + '/' + version,
                username: process.env.ARTIFACTORY_DEPLOY_USERNAME,
                password: process.env.ARTIFACTORY_DEPLOY_PASSWORD,
                properties: {
                    'vcs.revision': process.env.TRAVIS_COMMIT,
                    'vcs.branch': process.env.TRAVIS_BRANCH,
                    'build.name': name,
                    'build.number': process.env.TRAVIS_BUILD_NUMBER
                },
                request: {
                    headers: {
                        'X-Checksum-MD5': hashes.md5,
                        'X-Checksum-Sha1': hashes.sha1
                    }
                }
            } ) )
        .on('error', gutil.log);
} );

gulp.task( 'deploy-buildinfo', ['compute-hashes'], function() {
    if (process.env.TRAVIS_BRANCH != 'master') {
        gutil.log('Not on master, skip deploy-buildinfo');
        return;
    }
    var packageJSON = getPackageJSON();
    var version = packageJSON.version;
    var name = packageJSON.name;
    var buildNumber = process.env.TRAVIS_BUILD_NUMBER;
    return request.put({
        url: process.env.ARTIFACTORY_URL + '/api/build',
        json: buildInfo(name, version, buildNumber, hashes)
    }, function (error, response, body) {
        if (error) {
            gutil.log('error:', error);
        }
    })
    .auth(process.env.ARTIFACTORY_DEPLOY_USERNAME, process.env.ARTIFACTORY_DEPLOY_PASSWORD, true);
} );

gulp.task( 'deploy', ['deploy-buildinfo', 'deploy-vsix'], function() {
} );

function buildInfo(name, version, buildNumber, hashes) {
    return {
        "version" : "1.0.1",
        "name" : name,
        "number" : buildNumber,
        "started" : dateformat(new Date(), "yyyy-mm-dd'T'HH:MM:ss.lo"),
        "url": process.env.CI_BUILD_URL,
        "vcsRevision" : process.env.TRAVIS_COMMIT,
        "vcsUrl" : "https://github.com/"+ process.env.TRAVIS_REPO_SLUG +".git",
        "modules" : [ {
            "id" : "org.sonarsource.sonarlint.vscode:" + name + ":" + version,
            "properties": {
                "artifactsToPublish": "org.sonarsource.sonarlint.vscode:" + name + ":vsix"
            },
            "artifacts" : [ {
                "type" : "vsix",
                "sha1" : hashes.sha1,
                "md5" : hashes.md5,
                "name" : name + '-' + version + '.vsix'
            } ]
        } ],
        "properties" : {
            "buildInfo.env.PROJECT_VERSION": version,
            "buildInfo.env.ARTIFACTORY_DEPLOY_REPO": "sonarsource-public-qa",
            "buildInfo.env.TRAVIS_COMMIT": process.env.TRAVIS_COMMIT
        }
    }
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
		for (var algo in hashes) {
            if (hashes.hasOwnProperty(algo)) {
                hashes[algo] = crypto
                    .createHash(algo)
                    .update(file.contents, 'binary')
                    .digest('hex');
                gutil.log('Computed ' + algo + ': ' + hashes[algo]);
            }
        }

		this.push(file);
        callback();
	}

	return through.obj(processFile);
}