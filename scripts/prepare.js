'use strict';
const fs = require('fs');
const crypto = require('crypto');
const request = require('request');

if (!fs.existsSync('server')){
    fs.mkdirSync('server');
}

if (!fs.existsSync('analyzers')){
    fs.mkdirSync('analyzers');
}

downloadIfNeeded('/home/ben/dev/apex-scan/git-pmd/sonar-salesforce/sonar-salesforce-plugin/target/sonar-salesforce-plugin-3.8.jar', 'analyzers/codescan.jar');
downloadIfNeeded('/home/ben/dev/apex-scan/sonarlint-core/language-server/target/sonarlint-language-server-2.18-CODESCAN.jar', 'server/sonarlint-ls.jar');

function downloadIfNeeded(url, dest) {
    if (!fs.existsSync(dest)) {
	fs.writeFileSync(dest, fs.readFileSync(url));
    }
}

