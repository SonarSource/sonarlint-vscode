/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

'use strict';


import * as vscode from 'vscode';
import { window } from 'vscode';

const OPEN_FOLDER_ACTION = 'Open Folder';

export enum HotspotAnalysisConfirmation {
  RUN_ANALYSIS = 'Run analysis',
  DONT_ANALYZE = 'Don\'t analyze'
}

export type ChangeStatusType = 'hotspot' | 'issue';

export async function noWorkspaceFolderToScanMessage(): Promise<void> {
  const action = await vscode.window.showWarningMessage(
    'No workspace folder to scan, please open a workspace or folder first',
    OPEN_FOLDER_ACTION
  );
  if (action === OPEN_FOLDER_ACTION) {
    vscode.commands.executeCommand('vscode.openFolder');
  }
}

export async function tooManyFilesConfirmation(filesCount: number): Promise<HotspotAnalysisConfirmation> {
  return vscode.window.showWarningMessage(
    `There are ${filesCount} files to analyze for hotspots in project. 
        Analysis may consume too many resources. Do you want to proceed?\n 
        [Server analysis recommended](https://docs.sonarqube.org/latest/analyzing-source-code/overview/)`,
    HotspotAnalysisConfirmation.RUN_ANALYSIS, HotspotAnalysisConfirmation.DONT_ANALYZE
  );
}

export function notCompatibleServerWarning(folder: string, reason: string) {
  vscode.window.showWarningMessage(
    `Folder ${folder} can't be scanned for security hotspots.\n
    ${reason}`
  );
}

export function showChangeStatusConfirmationDialog(changeStatusType: ChangeStatusType) {
  let message = `This action will change the status of the ${changeStatusType} on the connected server.`;
  const noteAboutQualityGate = changeStatusType === 'hotspot'
    ? ''
    : ` A resolved ${changeStatusType} will be ignored when assessing the Quality Gate.`;
  message = message + noteAboutQualityGate;
  return window.showInformationMessage('Do you want to do this?', {
      modal: true,
      detail: message
    },
    'Yes');
}
