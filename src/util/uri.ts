/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
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
import * as path from 'path';

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

export function getFileNameFromFullPath(fullPath: string): string {
  return fullPath.substring(fullPath.lastIndexOf('/') + 1);
}

export function getRelativePathWithFileNameFromFullPath(fullPath: string, workspaceFolder: vscode.WorkspaceFolder,): string {
  const fullFsPath = vscode.Uri.parse(fullPath).fsPath; // /Users/user/sonarlint-vscode/samples/main.js
  const workspaceFolderFsPath = workspaceFolder.uri.fsPath; // /Users/user/sonarlint-vscode/
  return fullFsPath.replace(`${workspaceFolderFsPath}${path.sep}`, ''); // samples/main.js
}

export function getRelativePathFromFullPath(
  fullPath: string,
  workspaceFolder: vscode.WorkspaceFolder,
  specifyWorkspaceFolderName: boolean
): string {
  const relativePathWithFileName = getRelativePathWithFileNameFromFullPath(fullPath, workspaceFolder)
  const fileName = getFileNameFromFullPath(fullPath); // main.js
  const relativePathWithoutFileName = relativePathWithFileName.replace(`${fileName}`, ''); // samples/
  if (specifyWorkspaceFolderName) {
    return relativePathWithoutFileName
      ? `${workspaceFolder.name} • ${relativePathWithoutFileName}`
      : workspaceFolder.name;
  }
  if (relativePathWithFileName.endsWith(path.sep)) { //NB: Use os-specific path separator
    return relativePathWithoutFileName.substring(0, relativePathWithFileName.length - 2);
  }
  return relativePathWithoutFileName;
}

export function getUriFromRelativePath(relativePath: string, workspaceFolder: vscode.WorkspaceFolder): string {
  const workspaceFolderUri = workspaceFolder.uri;
  return `${workspaceFolderUri}/${relativePath}`;
}
