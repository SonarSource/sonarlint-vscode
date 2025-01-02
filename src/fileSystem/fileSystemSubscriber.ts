/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

'use strict';

import * as vscode from 'vscode';

export interface FileSystemSubscriber {
  onFile(folderUri: string, fileName: string, fullFileUri: vscode.Uri): void;
  didRemoveWorkspaceFolder(workspaceFolderUri: vscode.Uri): void;
}
