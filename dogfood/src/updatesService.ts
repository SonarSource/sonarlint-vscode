/* --------------------------------------------------------------------------------------------
 * SonarLint Dogfood
 * Copyright (C) 2021-2024 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as vscode from 'vscode';
import fetch from 'node-fetch';
import * as semver from 'semver';
import { CONFIG_SECTION, COMMAND_CHECK_NOW, ARTIFACTORY_DOGFOOD_URL } from './constants';
import { StatusBar } from './statusBar';
import { installAndRestart } from './pluginInstallationService';
import { getUserToken, isAuthenticated } from './authenticationService';
import { Status } from './status'

let checkSetTimeout: NodeJS.Timeout;

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
  const userToken = getUserToken(context);
  const dogfoodFile = await fetch(ARTIFACTORY_DOGFOOD_URL, {
    headers: {
      Authorization: `Bearer ${userToken}`
    }
  });
  if (dogfoodFile.status === 200) {
    const { version, url } = await dogfoodFile.json() as { version: string, url: string };
    const installedSonarLint = vscode.extensions.getExtension('SonarSource.sonarlint-vscode');
    if (
      installedSonarLint === undefined ||
      semver.compareBuild(installedSonarLint.packageJSON.version, version) < 0
    ) {
      await updateAvailable(version, url, installedSonarLint, statusBar, context);
    }
    statusBar.setStatus(Status.IDLE);
  } else {
    throw new Error('Could not fetch dogfood.json');
  }
}

async function updateAvailable(version: string, url: string, installedSonarLint: any, statusBar: StatusBar, context: vscode.ExtensionContext) {
  statusBar.setStatus(Status.UPDATE_AVAILABLE);
  const installNow = await vscode.window.showInformationMessage(`New dogfood build ${version} found.`, 'Install');
  if (installNow === 'Install') {
    await installAndRestart(version, url, installedSonarLint, statusBar, context);
  }
}

export function disableAutomaticUpdateCheck() {
  if (checkSetTimeout) {
    clearTimeout(checkSetTimeout);
  }
}