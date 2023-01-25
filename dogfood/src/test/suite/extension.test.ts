/* --------------------------------------------------------------------------------------------
 * SonarLint Dogfood
 * Copyright (C) 2021-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  test('should activate', async () => {

    const registeredCommands = await vscode.commands.getCommands();
    assert.equal(registeredCommands.filter(c => c === 'SonarLintDogfood.CheckNow').length, 1);

  });
});
