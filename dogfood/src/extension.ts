/* --------------------------------------------------------------------------------------------
 * SonarLint Dogfood
 * Copyright (C) 2021-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as vscode from 'vscode';
import { checkUpdateNow, disableAutomaticUpdateCheck } from './updatesService';
import { COMMAND_AUTHENTICATE, COMMAND_CHECK_NOW, CONFIG_SECTION, PIN_VERSION_CONFIG_KEY } from './constants';
import { StatusBar } from './statusBar';
import { Status } from './status';
import { updateUserToken } from './authenticationService';

let statusBar: StatusBar;

export function activate(context: vscode.ExtensionContext) {
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
  statusBar = new StatusBar(statusBarItem);
  statusBarItem.command = COMMAND_CHECK_NOW;
  context.subscriptions.push(statusBarItem);

  context.subscriptions.push(vscode.commands.registerCommand(COMMAND_CHECK_NOW, () => checkUpdateNow(context, statusBar)));
  context.subscriptions.push(vscode.commands.registerCommand(COMMAND_AUTHENTICATE, () => updateUserToken(context)));

  vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration(CONFIG_SECTION)) {
      const configuration = getDogfoodConfiguration();
      if (e.affectsConfiguration(PIN_VERSION_CONFIG_KEY)) {
        vscode.window.showInformationMessage('SonarQube for VS Code dogfooding version pinned.\nNewer versions will not be installed until this setting is populated.')
      }
      if (configuration.get('check.disable')) {
        statusBar.setStatus(Status.DISABLED);
        disableAutomaticUpdateCheck();
      } else {
        statusBar.setStatus(Status.UNKNOWN);
        vscode.commands.executeCommand(COMMAND_CHECK_NOW);
      }
    }
  });

  if (!getDogfoodConfiguration().get('check.disable')) {
    vscode.commands.executeCommand(COMMAND_CHECK_NOW);
  } else {
    statusBar.setStatus(Status.DISABLED);
  }
}

function getDogfoodConfiguration() {
  return vscode.workspace.getConfiguration(CONFIG_SECTION);
}

export function deactivate() {
  // NOP
}

