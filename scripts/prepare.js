"use strict";
const fs = require("fs");
const crypto = require("crypto");
const request = require("request");

const languageServerVersion = '3.7.1.1756';
const sonarJsVersion = '4.1.0.6085';
const sonarPhpVersion = '2.13.0.3107';
const sonarPythonVersion = '1.10.0.2131';
const sonarTsVersion = '1.7.0.2893';

if (!fs.existsSync("server")) {
  fs.mkdirSync("server");
}

if (!fs.existsSync("analyzers")) {
  fs.mkdirSync("analyzers");
}

downloadIfNeeded(
  //`https://repo1.maven.org/maven2/org/sonarsource/sonarlint/core/sonarlint-language-server/${languageServerVersion}/sonarlint-language-server-${languageServerVersion}.jar`,
  `https://repox.sonarsource.com/sonarsource/org/sonarsource/sonarlint/core/sonarlint-language-server/${languageServerVersion}/sonarlint-language-server-${languageServerVersion}.jar`,
  "server/sonarlint-ls.jar"
);
downloadIfNeeded(
  `https://repo1.maven.org/maven2/org/sonarsource/javascript/sonar-javascript-plugin/${sonarJsVersion}/sonar-javascript-plugin-${sonarJsVersion}.jar`,
  "analyzers/sonarjs.jar"
);
downloadIfNeeded(
  `https://repo1.maven.org/maven2/org/sonarsource/php/sonar-php-plugin/${sonarPhpVersion}/sonar-php-plugin-${sonarPhpVersion}.jar`,
  "analyzers/sonarphp.jar"
);
downloadIfNeeded(
  `https://repo1.maven.org/maven2/org/sonarsource/python/sonar-python-plugin/${sonarPythonVersion}/sonar-python-plugin-${sonarPythonVersion}.jar`,
  "analyzers/sonarpython.jar"
);
downloadIfNeeded(
  `https://repox.sonarsource.com/sonarsource/org/sonarsource/typescript/sonar-typescript-plugin/${sonarTsVersion}/sonar-typescript-plugin-${sonarTsVersion}.jar`,
  "analyzers/sonarts.jar"
);

function downloadIfNeeded(url, dest) {
  request(url + ".sha1", function(error, response, body) {
    if (error) {
      console.error("error:", error);
    } else {
      downloadIfChecksumMismatch(body, url, dest);
    }
  });
}

function downloadIfChecksumMismatch(expectedChecksum, url, dest) {
  if (!fs.existsSync(dest)) {
    request(url).pipe(fs.createWriteStream(dest));
  } else {
    fs
      .createReadStream(dest)
      .pipe(crypto.createHash("sha1").setEncoding("hex"))
      .on("finish", function() {
        let sha1 = this.read();
        if (expectedChecksum != sha1) {
          console.info("Checksum mismatch for " + dest + ". Will download it!");
          request(url).pipe(fs.createWriteStream(dest));
        }
      });
  }
}
