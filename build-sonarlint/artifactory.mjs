/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import fetch from 'node-fetch';

const { ARTIFACTORY_PRIVATE_READER_USERNAME, ARTIFACTORY_PRIVATE_READER_PASSWORD } = process.env;

const auth = {
  user: ARTIFACTORY_PRIVATE_READER_USERNAME,
  pass: ARTIFACTORY_PRIVATE_READER_PASSWORD
};

const credentialsDefined =
  ARTIFACTORY_PRIVATE_READER_USERNAME !== undefined && ARTIFACTORY_PRIVATE_READER_PASSWORD !== undefined;

const repoRoot = credentialsDefined ?
  // When artifactory credentials are defined, use SonarSource internal artifactory
  'https://repox.jfrog.io/artifactory/sonarsource' :
  // Otherwise, fallback to Maven Central (only releases)
  'https://repo.maven.apache.org/maven2';

const authenticatedFetch = url => fetch(url, {
  headers: {
    Authorization: 'Basic ' + Buffer.from(`${artifactory.auth.user}:${artifactory.auth.pass}`).toString('base64')
  }
});

const maybeAuthenticatedFetch = credentialsDefined ? authenticatedFetch : fetch;

const artifactory = {
  repoRoot,
  auth,
  credentialsDefined,
  maybeAuthenticatedFetch
}

export default artifactory;
