/* --------------------------------------------------------------------------------------------
 * SonarLint Dogfood
 * Copyright (C) 2021-2021 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as fs from 'fs';
import fetch from 'node-fetch';
import * as path from 'path';
import * as vscode from 'vscode';

const CONFIG_SECTION = 'sonarlint-dogfood';
const COMMAND_CHECK_NOW = 'SonarLintDogfood.CheckNow';

const ARTIFACTORY_BASE_URL = 'https://repox.jfrog.io/repox';
const ARTIFACTORY_VSCODE_PATH = `${ARTIFACTORY_BASE_URL}/sonarsource/org/sonarsource/sonarlint/vscode/sonarlint-vscode`;
const ARTIFACTORY_DOGFOOD_URL = `${ARTIFACTORY_VSCODE_PATH}/dogfood.json`;

let statusBar: StatusBar;
let downloadDirectory: string;
let checkSetTimeout: NodeJS.Timeout;

export function activate(context: vscode.ExtensionContext) {

  downloadDirectory = path.join(context.extensionPath, 'temp');

  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
  statusBar = new StatusBar(statusBarItem);
  statusBarItem.command = COMMAND_CHECK_NOW;
  context.subscriptions.push(statusBarItem);

  context.subscriptions.push(vscode.commands.registerCommand(COMMAND_CHECK_NOW, async () => {
    if (checkSetTimeout) {
      clearTimeout(checkSetTimeout);
    }
    statusBar.setStatus(Status.CHECKING);
    try {
      await checkUpdate();
    } catch (e) {
      console.error(e);
      statusBar.setStatus(Status.ERROR);
    } finally {
      const periodInSeconds = vscode.workspace.getConfiguration(CONFIG_SECTION).get('check.periodInSeconds') as number;
      checkSetTimeout = setTimeout(() => vscode.commands.executeCommand(COMMAND_CHECK_NOW), periodInSeconds * 1000);
    }
  }));

  vscode.workspace.onDidChangeConfiguration(e => {
    if(e.affectsConfiguration(CONFIG_SECTION)) {
      const configuration = vscode.workspace.getConfiguration(CONFIG_SECTION);
      if (configuration.get('check.disable')) {
        statusBar.setStatus(Status.DISABLED);
        if (checkSetTimeout) {
          clearTimeout(checkSetTimeout);
        }
      } else {
        statusBar.setStatus(Status.UNKNOWN);
        vscode.commands.executeCommand(COMMAND_CHECK_NOW);
      }
    }
  });

  if (!vscode.workspace.getConfiguration(CONFIG_SECTION).get('check.disable')) {
    vscode.commands.executeCommand(COMMAND_CHECK_NOW);
  } else {
    statusBar.setStatus(Status.DISABLED);
  }
}

class StatusBar {
  private status: Status;
  private lastCheck?: Date;

  constructor(private readonly statusBarItem: vscode.StatusBarItem) {
    this.status = Status.UNKNOWN;
    this.refreshStatus();
  }

  setStatus(status: Status) {
    this.status = status;
    if (status === Status.IDLE) {
      this.lastCheck = new Date();
    }
    this.refreshStatus();
  }

  private refreshStatus() {
    this.statusBarItem.text = this.status.text;
    this.statusBarItem.tooltip = `SonarLint Dogfood: ${this.status.tooltip}`;
    if (this.lastCheck) {
      this.statusBarItem.tooltip += `\nLast checked: ${this.lastCheck}`;
    }
    this.statusBarItem.show();
  }
}

async function checkUpdate() {
  const dogfoodFile = await fetch(ARTIFACTORY_DOGFOOD_URL);
  if (dogfoodFile.status === 200) {
    const { version, url } = await dogfoodFile.json();
    const installedSonarLint = vscode.extensions.getExtension('SonarSource.sonarlint-vscode');
    if (
      installedSonarLint === undefined ||
      semverPlusBuildCompare(installedSonarLint.packageJSON.version, version) < 0
    ) {
      await updateAvailable(version, url, installedSonarLint);
    }
    statusBar.setStatus(Status.IDLE);
  } else {
    throw new Error('Could not fetch dogfood.json');
  }
}

async function updateAvailable(version: string, url: string, installedSonarLint: any) {
  statusBar.setStatus(Status.UPDATE_AVAILABLE);
  const installNow = await vscode.window.showInformationMessage(`New dogfood build ${version} found.`, 'Install');
  if (installNow === 'Install') {
    await installAndRestart(version, url, installedSonarLint);
  }
}

async function installAndRestart(version: string, url: string, installedSonarLint: any) {
  if(installedSonarLint) {
    statusBar.setStatus(Status.UNINSTALLING);
    await(vscode.commands.executeCommand('workbench.extensions.uninstallExtension', 'SonarSource.sonarlint-vscode'));
  }
  statusBar.setStatus(Status.DOWNLOADING);
  const vsixUri = await downloadVsix(version, url);
  await vscode.commands.executeCommand('workbench.extensions.installExtension', vsixUri);
  fs.unlinkSync(vsixUri.fsPath);
  fs.rmdirSync(path.dirname(vsixUri.fsPath));
  statusBar.setStatus(Status.IDLE);
  const restart = await vscode.window.showInformationMessage('New dogfood build installed!', 'Restart');
  if (restart === 'Restart') {
    vscode.commands.executeCommand('workbench.action.reloadWindow');
  }
}

async function downloadVsix(version: string, url: string) {
  return vscode.window.withProgress({location: vscode.ProgressLocation.Notification, title: `Downloading VSIX for ${version}`, cancellable: false}, async () => {
    console.debug('Downloading VSIX from ', url);
    const fetchResult = await fetch(url);
    const fileName = fetchResult.headers.get('X-Artifactory-Filename')!;
    const tempDir = fs.mkdtempSync(downloadDirectory);
    const vsixPath = path.join(tempDir, fileName);
    fs.writeFileSync(vsixPath, await fetchResult.buffer());
    console.debug('Created VSIX at ', vsixPath);
    return vscode.Uri.file(vsixPath);
  });
}

const SONARLINT_SEMVER_REGEXP = /(?<Major>\d+)\.(?<Minor>\d+)\.(?<Patch>\d+)(?:\+(?<Build>\d+))?/;

export function semverPlusBuildCompare(version1: string, version2: string) {
  const match1 = version1.match(SONARLINT_SEMVER_REGEXP);
  const match2 = version2.match(SONARLINT_SEMVER_REGEXP);
  if (! match1 || ! match2) {
    throw new Error('Both versions should match X.Y.Z(+BUILD)');
  }
  const majorCompare = integerCompare(match1.groups!.Major, match2.groups!.Major);
  if (majorCompare !== 0) {
    return majorCompare;
  }
  const minorCompare = integerCompare(match1.groups!.Minor, match2.groups!.Minor);
  if (minorCompare !== 0) {
    return minorCompare;
  }
  const patchCompare = integerCompare(match1.groups!.Patch, match2.groups!.Patch);
  if (patchCompare !== 0) {
    return patchCompare;
  }
  return integerCompare(match1.groups!.Build, match2.groups!.Build);
}

function integerCompare(arg1: string, arg2: string) {
  const num1 = Number.parseInt(arg1);
  const num2 = Number.parseInt(arg2);
  if(num1 === num2) {
    return 0;
  }
  return (num1 < num2) ? -1 : 1;
}

export function deactivate() {
  // NOP
}

class Status {

  private constructor(readonly text: string, readonly tooltip: string) {
    // Empty
  }

  static readonly UNKNOWN = new Status('😺', 'Unknown');
  static readonly IDLE = new Status('😸', 'Idle');
  static readonly DISABLED = new Status('😿', 'Disabled');
  static readonly UPDATE_AVAILABLE = new Status('😻', 'Update Available');
  static readonly CHECKING = new Status('😼', 'Checking');
  static readonly DOWNLOADING = new Status('😼', 'Downloading');
  static readonly UNINSTALLING = new Status('😼', 'Uninstalling Previous Build');
  static readonly INSTALLING = new Status('😼', 'Installing Next Build');
  static readonly ERROR = new Status('🙀', 'Error (check console)');
}
