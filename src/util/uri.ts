/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

/*
 * Fix for https://jira.sonarsource.com/browse/SLVSCODE-121
 * Inspired by https://github.com/forcedotcom/salesforcedx-vscode/blob/0edd9583812a4f07bfb2890f63ce65430ad7002f/packages/salesforcedx-vscode-apex/src/languageServer.ts
 */

/*
 * Copyright (c) 2017, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as vscode from 'vscode';

// See https://github.com/Microsoft/vscode-languageserver-node/issues/105
export function code2ProtocolConverter(value: vscode.Uri) {
  if (/^win32/.test(process.platform)) {
    // The *first* : is also being encoded which is not the standard for URI on Windows
    // Here we transform it back to the standard way
    return value.toString().replace(/%3A/i, ':');
  } else {
    return value.toString();
  }
}

export function protocol2CodeConverter(value: string) {
  return vscode.Uri.parse(value);
}

export function getFileNameFromFullPath(fullPath: string) {
  // file:///Users/sophio.japharidze/Documents/Sonar/dmaap-datarouter/datarouter-prov/src/main/java/org/onap/dmaap/datarouter/authz/AuthorizationResponseSupplement.java
  return fullPath.substring(fullPath.lastIndexOf('/') + 1);
}

export function getRelativePathFromFullPath(
  fullPath: string,
  workspaceFolder: vscode.WorkspaceFolder,
  specifyWorkspaceFolderName: boolean
) {
  const fullUri = vscode.Uri.parse(fullPath);
  const fileName = getFileNameFromFullPath(fullPath);
  const workspaceFolderUri = workspaceFolder.uri.fsPath;
  const relativePathWithFileName = fullUri.fsPath.replace(`${workspaceFolderUri}/`, '');
  const relativePathWithoutFileName = relativePathWithFileName.replace(`${fileName}`, '');
  if(specifyWorkspaceFolderName){
    return relativePathWithoutFileName ?  `${workspaceFolder.name} • ${relativePathWithoutFileName}` : workspaceFolder.name;
  }
  return relativePathWithoutFileName;
}
