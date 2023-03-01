/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';

const FIRST_SECRET_ISSUE_DETECTED_KEY = 'FIRST_SECRET_ISSUE_DETECTED_KEY';

export async function showNotificationForFirstSecretsIssue(context: vscode.ExtensionContext) {
  const showProblemsViewActionTitle = 'Show Problems View';
  vscode.window
    .showWarningMessage(
      'SonarLint detected some secrets in one of the open files.\n' +
      'We strongly advise you to review those secrets and ensure they are not committed into repositories. ' +
      'Please refer to the Problems view for more information.',
      showProblemsViewActionTitle
    )
    .then(action => {
      if (action === showProblemsViewActionTitle) {
        vscode.commands.executeCommand('workbench.panel.markers.view.focus');
      }
    });
  context.globalState.update(FIRST_SECRET_ISSUE_DETECTED_KEY, true);
}

export function isFirstSecretDetected(context: vscode.ExtensionContext): boolean {
  const result = context.globalState.get(FIRST_SECRET_ISSUE_DETECTED_KEY);
  if (typeof result == 'string') {
    // migrate
    context.globalState.update(FIRST_SECRET_ISSUE_DETECTED_KEY, result === 'true');
  }
  return context.globalState.get(FIRST_SECRET_ISSUE_DETECTED_KEY, false);
}
