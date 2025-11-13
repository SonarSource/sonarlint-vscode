/* --------------------------------------------------------------------------------------------
 * SonarLint Dogfood
 * Copyright (C) 2021-2025 SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { StatusBar } from './statusBar';
import { Status } from './status';
import { getUserToken } from './authenticationService';

export async function installAndRestart(version: string,
                                        url: string,
                                        pinned: boolean,
                                        installedSonarLint: any,
                                        statusBar: StatusBar,
                                        context: vscode.ExtensionContext) {
  if (installedSonarLint) {
    statusBar.setStatus(Status.UNINSTALLING);
    await (vscode.commands.executeCommand('workbench.extensions.uninstallExtension', 'SonarSource.sonarlint-vscode'));
  }
  statusBar.setStatus(Status.DOWNLOADING);
  const vsixUri = await downloadVsix(version, url, context);
  await vscode.commands.executeCommand('workbench.extensions.installExtension', vsixUri);
  fs.unlinkSync(vsixUri.fsPath);
  fs.rmdirSync(path.dirname(vsixUri.fsPath));
  pinned ? statusBar.setStatus(Status.PINNED_VERSION_USED) : statusBar.setStatus(Status.IDLE);
  const restart = await vscode.window.showInformationMessage('New dogfood build installed!', 'Restart');
  if (restart === 'Restart') {
    vscode.commands.executeCommand('workbench.action.reloadWindow');
  }
}

export async function downloadVsix(version: string, url: string, context: vscode.ExtensionContext) {
  const downloadDirectory = path.join(context.extensionPath, 'temp');
  const userToken = getUserToken(context);
  return vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: `Downloading VSIX for ${version}`,
    cancellable: true
  }, async (progress, cancelToken) => {
    console.debug('Downloading VSIX from ', url);
    const fetchAbort = new AbortController();
    cancelToken.onCancellationRequested(() => {
      fetchAbort.abort('Download canceled by user');
    });
    const fetchResult = await fetch(url, {
      headers: {
        Authorization: `Bearer ${userToken}`
      },
      signal: fetchAbort.signal
    });
    const contentLength = parseInt(fetchResult.headers.get('content-length') ?? '0');
    if (!contentLength) {
      console.error('No content-length header found in response');
    }

    const chunks: Uint8Array[] = [];
    const reader = fetchResult.body?.getReader();
    while(true) {
      const { done, value } = await reader?.read() ?? { done: true, value: undefined };
      if (done || !value) {
        break;
      }
      chunks.push(value);

      const increment = 100 * value.length / contentLength;
      progress.report({message: 'Downloading', increment});
    }

    progress.report({ message: 'Downloaded', increment: 1.0 });

    const fileName = fetchResult.headers.get('X-Artifactory-Filename') ?? `sonarlint-vscode-${version}.vsix`;
    const tempDir = fs.mkdtempSync(downloadDirectory);
    const vsixPath = path.join(tempDir, fileName);
    fs.writeFileSync(vsixPath, Buffer.concat(chunks));
    console.debug('Created VSIX at ', vsixPath);
    return vscode.Uri.file(vsixPath);
  });
}
