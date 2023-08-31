const getPackageJSON = require('./fsUtils.js').getPackageJSON;
const exec = require('child_process').exec;

module.exports = function cycloneDx() {
  const packageJSON = getPackageJSON();
  const version = packageJSON.version;
  const cycloneDxCommand = `npm run cyclonedx-run -- -d --output sonarlint-vscode-${version}.sbom-cyclonedx.json`;
  exec(cycloneDxCommand, (err, stdout, stderr) => {
    console.log(stdout);
    console.log(stderr);
  });
}

cycloneDx();
