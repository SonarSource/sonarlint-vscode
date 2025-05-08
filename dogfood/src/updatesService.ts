/* --------------------------------------------------------------------------------------------
 * SonarLint Dogfood
 * Copyright (C) 2021-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as vscode from 'vscode';
import * as semver from 'semver';
import { CONFIG_SECTION, COMMAND_CHECK_NOW, ARTIFACTORY_DOGFOOD_URL, PIN_VERSION_CONFIG_KEY, ARTIFACTORY_VSCODE_PATH } from './constants';
import { StatusBar } from './statusBar';
import { installAndRestart } from './pluginInstallationService';
import { getUserToken, isAuthenticated } from './authenticationService';
import { Status } from './status'

let checkSetTimeout: NodeJS.Timeout;

interface DogfoodInfo {
  version: string,
  url: string,
  pinned: boolean
}

export async function checkUpdateNow(context: vscode.ExtensionContext, statusBar: StatusBar) {
  if (!isAuthenticated(context)) {
    statusBar.setStatus(Status.UNAUTHENTICATED);
    return;
  }

  if (checkSetTimeout) {
    clearTimeout(checkSetTimeout);
  }
  statusBar.setStatus(Status.CHECKING);

  try {
    await checkUpdate(statusBar, context);
  } catch (e) {
    console.error(e);
    statusBar.setStatus(Status.ERROR);
  } finally {
    const periodInSeconds = vscode.workspace.getConfiguration(CONFIG_SECTION).get('check.periodInSeconds') as number;
    checkSetTimeout = setTimeout(() => vscode.commands.executeCommand(COMMAND_CHECK_NOW), periodInSeconds * 1000);
  }
}

async function checkUpdate(statusBar: StatusBar, context: vscode.ExtensionContext) {
  const dogfoodInfo = await getDogfoodInfo(context);
  if (dogfoodInfo?.version && dogfoodInfo?.url) {
    const installedSonarLint = vscode.extensions.getExtension('SonarSource.sonarlint-vscode');
    if (reinstallationNeeded(dogfoodInfo, installedSonarLint)) {
      await updateAvailable(dogfoodInfo, installedSonarLint, statusBar, context);
    }
    dogfoodInfo.pinned ? statusBar.setStatus(Status.PINNED_VERSION_USED) : statusBar.setStatus(Status.IDLE);
  }
}

function reinstallationNeeded(dogfoodInfo: DogfoodInfo, installedSonarLint: vscode.Extension<any> | undefined) {
  if (dogfoodInfo.pinned) {
    return installedSonarLint === undefined || semver.compareBuild(versionWithBuildNumber(installedSonarLint.packageJSON), dogfoodInfo.version) !== 0;
  }
  return installedSonarLint === undefined ||
      semver.compareBuild(versionWithBuildNumber(installedSonarLint.packageJSON), dogfoodInfo.version) < 0
}

function versionWithBuildNumber(packageJSON: any): string {
  const buildNumberSuffix = packageJSON.buildNumber ? `+${packageJSON.buildNumber}` : '';
  return packageJSON.version + buildNumberSuffix;
}

async function getDogfoodInfo(context: vscode.ExtensionContext): Promise<DogfoodInfo | undefined> {
  const pinVersion = vscode.workspace.getConfiguration(CONFIG_SECTION).get(PIN_VERSION_CONFIG_KEY) as string;

  if (pinVersion) {
    const baseVersion = pinVersion.split('+')[0];
    return {
      version: pinVersion,
      url: `${ARTIFACTORY_VSCODE_PATH}/${pinVersion}/sonarlint-vscode-${baseVersion}.vsix`,
      pinned: true
    }
  } else {
    const userToken = getUserToken(context);
    const dogfoodFile = await fetch(ARTIFACTORY_DOGFOOD_URL, {
      headers: {
        Authorization: `Bearer ${userToken}`
      }
    });
    if (dogfoodFile.status === 200) {
      const { version, url } = await dogfoodFile.json() as { version: string, url: string };
      return { version, url, pinned: false }
    } else {
      throw new Error('Could not fetch dogfood.json');
    }
  }
}

async function updateAvailable(dogfoodInfo: DogfoodInfo, installedSonarLint: any, statusBar: StatusBar, context: vscode.ExtensionContext) {
  statusBar.setStatus(Status.UPDATE_AVAILABLE);

  const message = dogfoodInfo.pinned ?
      `SonarLint for VSCode dogfood version ${dogfoodInfo.version} is ready for installation. This version was specified in your settings` :
      `New dogfood build ${dogfoodInfo.version} found.`;

  const installNow = await vscode.window.showInformationMessage(message, 'Install');
  if (installNow === 'Install') {
    await installAndRestart(dogfoodInfo.version, dogfoodInfo.url, dogfoodInfo.pinned, installedSonarLint, statusBar, context);
  }
}

export function disableAutomaticUpdateCheck() {
  if (checkSetTimeout) {
    clearTimeout(checkSetTimeout);
  }
}
