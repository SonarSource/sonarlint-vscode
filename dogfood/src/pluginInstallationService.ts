/* --------------------------------------------------------------------------------------------
 * SonarLint Dogfood
 * Copyright (C) 2021-2024 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import fetch from 'node-fetch';
import { StatusBar } from './statusBar';
import { Status } from './status';
import { getUserToken } from './authenticationService';

export async function installAndRestart(version: string, url: string, installedSonarLint: any, statusBar: StatusBar, context: vscode.ExtensionContext) {
  if(installedSonarLint) {
    statusBar.setStatus(Status.UNINSTALLING);
    await(vscode.commands.executeCommand('workbench.extensions.uninstallExtension', 'SonarSource.sonarlint-vscode'));
  }
  statusBar.setStatus(Status.DOWNLOADING);
  const vsixUri = await downloadVsix(version, url, context);
  await vscode.commands.executeCommand('workbench.extensions.installExtension', vsixUri);
  fs.unlinkSync(vsixUri.fsPath);
  fs.rmdirSync(path.dirname(vsixUri.fsPath));
  statusBar.setStatus(Status.IDLE);
  const restart = await vscode.window.showInformationMessage('New dogfood build installed!', 'Restart');
  if (restart === 'Restart') {
    vscode.commands.executeCommand('workbench.action.reloadWindow');
  }
}

export async function downloadVsix(version: string, url: string, context: vscode.ExtensionContext) {
  const downloadDirectory = path.join(context.extensionPath, 'temp');
  const userToken = getUserToken(context);
  return vscode.window.withProgress({location: vscode.ProgressLocation.Notification, title: `Downloading VSIX for ${version}`, cancellable: false}, async () => {
    console.debug('Downloading VSIX from ', url);
    const fetchResult = await fetch(url, {
      headers: {
        Authorization: `Bearer ${userToken}`
      }
    });
    const fileName = fetchResult.headers.get('X-Artifactory-Filename')!;
    const tempDir = fs.mkdtempSync(downloadDirectory);
    const vsixPath = path.join(tempDir, fileName);
    fs.writeFileSync(vsixPath, Buffer.from(await fetchResult.arrayBuffer()));
    console.debug('Created VSIX at ', vsixPath);
    return vscode.Uri.file(vsixPath);
  });
}