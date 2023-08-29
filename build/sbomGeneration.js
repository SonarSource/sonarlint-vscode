import { getPackageJSON } from './fsUtils.js';
import { exec } from 'child_process';

export function cycloneDx() {
  const packageJSON = getPackageJSON();
  const version = packageJSON.version;
  const cycloneDxCommand = `npm run cyclonedx-run -- -d --output sonarlint-vscode-${version}.sbom-cyclonedx.json`;
  exec(cycloneDxCommand, (err, stdout, stderr) => {
    console.log(stdout);
    console.log(stderr);
  });
}
