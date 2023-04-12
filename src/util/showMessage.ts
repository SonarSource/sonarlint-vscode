/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

'use strict';


import * as vscode from 'vscode';

const OPEN_FOLDER_ACTION = 'Open Folder';

export async function noWorkspaceFolderToScanMessage() {
  const action = await vscode.window.showWarningMessage(
    'No workspace folder to scan, please open a workspace or folder first',
    OPEN_FOLDER_ACTION
  );
  if (action === OPEN_FOLDER_ACTION) {
    vscode.commands.executeCommand('vscode.openFolder');
  }
}
