/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';

export const SONARLINT_CATEGORY = 'sonarlint';

export function getSonarLintConfiguration(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration(SONARLINT_CATEGORY);
}

export function isVerboseEnabled(): boolean {
  return getSonarLintConfiguration().get('output.showVerboseLogs', false);
}
