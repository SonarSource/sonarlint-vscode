/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
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

(async () => {
  /**
   * @type ovsx.PublishOptions
   */
  const options = {
    extensionFile: ARTIFACT_FILE,
    pat: OPENVSX_TOKEN
  };
  await ovsx.publish(options);

})()
  .then(() => {
    process.exit(0);
  })
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
