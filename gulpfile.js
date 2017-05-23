'use strict';
const gulp = require('gulp');
const download = require('gulp-download');
//...

gulp.task('get_server', ()=>
{
	download("https://repox.sonarsource.com/sonarsource-public-builds/org/sonarsource/sonarlint/core/sonarlint-language-server/2.14.0.642/sonarlint-language-server-2.14.0.642.jar")
		.pipe(gulp.dest('./lib/sonarlint-server.jar'))
});
