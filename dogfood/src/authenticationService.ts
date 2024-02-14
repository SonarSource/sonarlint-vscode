/* --------------------------------------------------------------------------------------------
 * SonarLint Dogfood
 * Copyright (C) 2021-2024 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode'
import { DOGFOOD_ARTIFACTORY_USER_TOKEN } from './constants'

export function isAuthenticated(context: vscode.ExtensionContext) {
	return context.globalState.get(DOGFOOD_ARTIFACTORY_USER_TOKEN) !== undefined;
}

export async function updateUserToken(context: vscode.ExtensionContext) {
	const userToken = await vscode.window.showInputBox();
	if(userToken) {
		await context.globalState.update(DOGFOOD_ARTIFACTORY_USER_TOKEN, userToken);
	} else {
		vscode.window.showErrorMessage('SonarLint Dogfood: Could not update Artifactory user token. Please try again');
	}
}

export function getUserToken(context: vscode.ExtensionContext) {
	return context.globalState.get(DOGFOOD_ARTIFACTORY_USER_TOKEN);
}