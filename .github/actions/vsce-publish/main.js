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

import * as vsce from 'vsce';

/*
 * See https://code.visualstudio.com/api/working-with-extensions/publishing-extension#platformspecific-extensions
 * See also https://github.com/microsoft/vsmarketplace/issues/219
 * See complement in release.yml:deploy_to_microsoft_marketplace.strategy.matrix.platform
 */
const UNIVERSAL_PLATFORMS = [
  'win32-ia32', 'win32-arm64', 'linux-armhf', 'alpine-x64', 'alpine-arm64'
];

const {
  ARTIFACT_FILE,
  TARGET_PLATFORM,
  VSCE_TOKEN
} = process.env;

(async () => {
  /**
   * @type vsce.IPublishVSIXOptions
   */
  const options = {
    pat: VSCE_TOKEN
  };

  if (TARGET_PLATFORM === 'universal') {
    for (target of UNIVERSAL_PLATFORMS) {
      options.target = target;
      await vsce.publishVSIX(ARTIFACT_FILE, options);
    }
  } else {
    options.target = TARGET_PLATFORM;
    await vsce.publishVSIX(ARTIFACT_FILE, options);
  }

})()
  .then(() => {
    process.exit(0);
  })
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
