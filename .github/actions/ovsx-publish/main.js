/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
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

import * as ovsx from 'ovsx';

const {
  ARTIFACT_FILE,
  OPENVSX_TOKEN
} = process.env;

console.log(`Publishing ${ARTIFACT_FILE} to OpenVSX`);

(async () => {
  /**
   * @type ovsx.PublishOptions
   */
  const options = {
    extensionFile: ARTIFACT_FILE,
    pat: OPENVSX_TOKEN
  };
  const [ publicationResult ] = await ovsx.publish(options);
  if (publicationResult.status === 'rejected') {
    throw new Error(`Impossible to publish ${ARTIFACT_FILE} to OpenVSX`, { cause: publicationResult.reason });
  }
})()
  .then(() => {
    console.log(`Published ${ARTIFACT_FILE} to OpenVSX`);
    process.exit(0);
  })
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
