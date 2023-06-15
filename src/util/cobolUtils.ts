/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import { Commands } from './commands';

const FIRST_COBOL_ISSUE_DETECTED_KEY = 'FIRST_COBOL_ISSUE_DETECTED_KEY';

export async function showNotificationForFirstCobolIssue(context: vscode.ExtensionContext) {
  const shareFeedbackActionTitle = 'Share feedback';
  vscode.window
    .showInformationMessage(
      'SonarLint analysis for COBOL is currently in Beta. \n' +
        'We welcome feedback to make improvements. ' +
        '[Learn more](https://github.com/SonarSource/sonarlint-vscode/wiki/Languages-and-rules#cobol-analysis)',
      shareFeedbackActionTitle
    )
    .then(action => {
      if (action === shareFeedbackActionTitle) {
        vscode.commands.executeCommand(Commands.TRIGGER_HELP_AND_FEEDBACK_LINK);
      }
    });
  context.globalState.update(FIRST_COBOL_ISSUE_DETECTED_KEY, true);
}

export function isFirstCobolIssueDetected(context: vscode.ExtensionContext): boolean {
  const result = context.globalState.get(FIRST_COBOL_ISSUE_DETECTED_KEY);
  if (typeof result == 'string') {
    // migrate
    context.globalState.update(FIRST_COBOL_ISSUE_DETECTED_KEY, result === 'true');
  }
  return context.globalState.get(FIRST_COBOL_ISSUE_DETECTED_KEY, false);
}
