/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

'use strict';


import * as vscode from 'vscode';
import { window } from 'vscode';
import { SslCertificateConfirmationParams } from '../lsp/protocol';
import { Commands } from '../util/commands';

const OPEN_FOLDER_ACTION = 'Open Folder';
export const DONT_ASK_AGAIN_ACTION = "Don't Ask Again";
export const CAN_SHOW_MISSING_REQUIREMENT_NOTIF = "canShowMissingRuntimeNotification";

export enum HotspotAnalysisConfirmation {
  RUN_ANALYSIS = 'Run analysis',
  DONT_ANALYZE = 'Don\'t analyze'
}

export type ChangeStatusType = 'hotspot' | 'issue' | 'dependency risk';

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
        [Server analysis recommended](https://docs.sonarsource.com/sonarqube-server/latest/analyzing-source-code/overview/)`,
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
  const noteAboutQualityGate = changeStatusType === 'issue'
    ? ` A resolved ${changeStatusType} will be ignored when assessing the Quality Gate.`
    : '';
  message = message + noteAboutQualityGate;
  return window.showInformationMessage('Do you want to do this?', {
      modal: true,
      detail: message
    },
    'Yes');
}

export async function showSslCertificateConfirmationDialog(cert: SslCertificateConfirmationParams) {
  const trust = 'Trust';
  const dontTrust = 'Don\'t trust';
  const fingerprints = cert.sha256Fingerprint === '' ? '' :
    `FINGERPRINTS\n
    SHA-256:\n ${cert.sha256Fingerprint}\n
    SHA-1:\n ${cert.sha1Fingerprint}\n`;
  const dialogResponse = await vscode.window.showErrorMessage(`
    SonarQube for VS Code found untrusted server's certificate\n
    Issued to:\n ${cert.issuedTo}\n
    Issued by:\n ${cert.issuedBy}\n
    VALIDITY PERIOD\n
    Valid from: ${cert.validFrom}\n
    Valid to: ${cert.validTo}\n
    ${fingerprints}
    If you trust the certificate, by default it will be saved in truststore '${cert.truststorePath}'\n
    Default password: sonarlint\n
    For actual values of truststore path and password, check the 'sonarlint.ls.vmargs' setting.\n
    Consider removing connection if you don't trust the certificate\n`,
    { modal: true }, dontTrust, trust);
  return dialogResponse === trust;
}

export function showNoActiveFileOpenWarning() {
  return window.showWarningMessage('At least one file needs to be open to use this command');
}

export function showNoFileWithUriError(uri: vscode.Uri) {
  vscode.window
  .showErrorMessage(
    `Could not find file '${uri}' in the current workspace.
      Please make sure that the right folder is open and bound to the right project on the server,
      the right branch is checked out,
      and that the file has not been removed or renamed.`,
    'Show Documentation'
  )
  .then(action => {
    if (action === 'Show Documentation') {
      vscode.commands.executeCommand(Commands.OPEN_BROWSER, vscode.Uri.parse('https://docs.sonarsource.com/sonarqube-for-ide/vs-code/troubleshooting/#no-matching-issue-found'));
    }
  });
}
