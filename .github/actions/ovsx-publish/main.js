/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

/*
 * Inspired from the open-vsx/publish-extensions script
 * https://github.com/open-vsx/publish-extensions/blob/b120c07520489d1c9da11b9cc388e4b42607bc00/publish-extension.js
 * Published under the terms of the Eclipse Public License v. 2.0
 * http://www.eclipse.org/legal/epl-2.0
 */

'use strict';

import fetch from 'node-fetch';
import * as fs from 'fs';
import * as ovsx from 'ovsx';

const {
  GITHUB_REF,
  OPENVSX_TOKEN
} = process.env;

const artifactoryPublicRepo = 'https://repox.jfrog.io/artifactory/sonarsource-public-releases';
const slvscodeBaseDir = artifactoryPublicRepo + '/org/sonarsource/sonarlint/vscode/sonarlint-vscode';

(async () => {

  // GITHUB_REF = refs/tags/<tagName>
  const tagName = GITHUB_REF.replace('refs/tags/', '');
  // tagName = <version>+<buildNumber>
  const version = tagName.split('+')[0];

  const artifactUrl = `${slvscodeBaseDir}/${version}/sonarlint-vscode-${version}.vsix`;

  const fetchResult = await fetch(artifactUrl);
  if (! fetchResult.ok || fetchResult.status !== 200) {
    throw Error(`Could not fetch artifact from Repox: ${fetchResult.statusText}`);
  }

  const fileName = fetchResult.headers.get('X-Artifactory-Filename');
  await new Promise((resolve, reject) => {
    const destination = fs.createWriteStream(fileName);
    destination.on('error', err => reject(err));
    fetchResult.body.pipe(destination);
    fetchResult.body.on('end', () => resolve());
  });

  // Create SonarSource namespace on OpenVSX if needed.
  try {
    await ovsx.createNamespace({ name: 'SonarSource', pat: OPENVSX_TOKEN });
  } catch (error) {
    console.log(`Creating Open VSX namespace failed -- assuming that it already exists`);
    console.log(error);
  }

  /**
   * @type ovsx.PublishOptions
   */
  const options = {
    fileName,
    pat: OPENVSX_TOKEN
  };
  await ovsx.publish(options);

})()
  .then(() => {
    return 0;
  })
  .catch(e => {
    return 1;
  });
