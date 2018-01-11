"use strict";
const fs = require("fs");
const crypto = require("crypto");
const request = require("request");

if (!fs.existsSync("server")) {
  fs.mkdirSync("server");
}

if (!fs.existsSync("analyzers")) {
  fs.mkdirSync("analyzers");
}

downloadIfNeeded(
  "https://repox.sonarsource.com/sonarsource/org/sonarsource/sonarlint/core/sonarlint-language-server/3.1.0.1320/sonarlint-language-server-3.1.0.1320.jar",
  "server/sonarlint-ls.jar"
);
downloadIfNeeded(
  "http://repo1.maven.org/maven2/org/sonarsource/javascript/sonar-javascript-plugin/3.1.0.5111/sonar-javascript-plugin-3.1.0.5111.jar",
  "analyzers/sonarjs.jar"
);
downloadIfNeeded(
  "http://repo1.maven.org/maven2/org/sonarsource/php/sonar-php-plugin/2.10.0.2087/sonar-php-plugin-2.10.0.2087.jar",
  "analyzers/sonarphp.jar"
);
downloadIfNeeded(
  "http://repo1.maven.org/maven2/org/sonarsource/python/sonar-python-plugin/1.8.0.1496/sonar-python-plugin-1.8.0.1496.jar",
  "analyzers/sonarpython.jar"
);
downloadIfNeeded(
  "https://repox.sonarsource.com/sonarsource/org/sonarsource/typescript/sonar-typescript-plugin/1.5.0.2021/sonar-typescript-plugin-1.5.0.2021.jar",
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
