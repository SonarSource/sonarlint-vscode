/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import artifactory from './artifactory.mjs';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';

const HTTP_BAD_REQUEST = 400;

export async function downloadFile(fileUrl, destPath, useAuthentication=false) {
  const maybeAuthenticatedFetch = useAuthentication ? artifactory.maybeAuthenticatedFetch : fetch;
  return new Promise(function (resolve, reject) {
    maybeAuthenticatedFetch(fileUrl).then(function (res) {
      if (res.status >= HTTP_BAD_REQUEST) {
        reject(new Error(`Unexpected HTTP status code: ${res.status} - ${res.statusText}`));
      }
      const fileStream = createWriteStream(destPath, { flags: 'w' });
      fileStream.on('finish', resolve);
      Readable.fromWeb(res.body)
        .on('error', reject)
        .pipe(fileStream);
    });
  });
}
