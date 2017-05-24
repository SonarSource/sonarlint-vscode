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

require('request-debug')(request);
//...

gulp.task('clean', ()=>
{
    del.sync('*.vsix');
    del.sync('server');
});


gulp.task('get-server', ()=>
{
    var serverFile = 'server/sonarlint-ls.jar';
    if (fs.existsSync(serverFile)) {
        return;
    }
	return download("https://repox.sonarsource.com/sonarsource-public-builds/org/sonarsource/sonarlint/core/sonarlint-language-server/2.14.0.644/sonarlint-language-server-2.14.0.644.jar")
        .pipe(rename("sonarlint-ls.jar"))
		.pipe(gulp.dest('./server/'))
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

gulp.task('package', ['get-server', 'update-version'], () => {
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
                url: process.env.ARTIFACTORY_URL + '/' + process.env.ARTIFACTORY_DEPLOY_REPO + '/org/sonarsource/sonarlint/vsts/' + name + '/' + version,
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

gulp.task( 'deploy', ['deploy-vsix', 'deploy-buildinfo'], function() {
} );

function buildInfo(name, version, buildNumber, hashes) {
    return {
        "version" : version,
        "name" : name,
        "number" : buildNumber,
        "started" : (new Date()).toJSON(),
        "modules" : [ {
            "id" : "org.sonarsource.sonarlint.vsts:" + name + ":" + version,
            "artifacts" : [ {
                "type" : "vsix",
                "sha1" : hashes.sha1,
                "md5" : hashes.md5,
                "name" : name + '-' + version + '.vsix'
            } ]
        } ]
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