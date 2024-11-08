/* --------------------------------------------------------------------------------------------
 * SonarLint Dogfood
 * Copyright (C) 2021-2024 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode'
import { COMMAND_CHECK_NOW, DOGFOOD_ARTIFACTORY_USER_TOKEN } from './constants'

export function isAuthenticated(context: vscode.ExtensionContext) {
  const storedToken: string | undefined = context.globalState.get<string>(DOGFOOD_ARTIFACTORY_USER_TOKEN);
  return storedToken ? storedToken.trim().length > 0 : false;
}

export async function updateUserToken(context: vscode.ExtensionContext) {
  const userToken = await vscode.window.showInputBox();
  if (userToken) {
    await context.globalState.update(DOGFOOD_ARTIFACTORY_USER_TOKEN, userToken);
    vscode.window.showInformationMessage('SonarQube for VS Code Dogfood: Artifactory token saved');
    vscode.commands.executeCommand(COMMAND_CHECK_NOW);
  } else {
    vscode.window.showErrorMessage('SonarQube for VS Code Dogfood: Could not update Artifactory user token. Please try again');
  }
}

export function getUserToken(context: vscode.ExtensionContext) {
  return context.globalState.get(DOGFOOD_ARTIFACTORY_USER_TOKEN);
}