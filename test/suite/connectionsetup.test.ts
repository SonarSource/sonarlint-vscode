/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import { Commands } from '../../src/commands';


suite('Connection Setup', () => {

  setup(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  test('should show webview when command is called', async () => {
    await vscode.commands.executeCommand(Commands.CONNECT_TO_SONARQUBE);
  });
});
