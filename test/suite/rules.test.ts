/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { expect } from 'chai';
import * as vscode from 'vscode';

suite('SonarLint Rules view', () => {
  suiteSetup('reset rules settings', async () => {
    await vscode.workspace.getConfiguration('sonarlint').update('rules', undefined, vscode.ConfigurationTarget.Global);
  });

  test('should show the whole list of rules grouped by language', async function() {

    const secretsAwsRuleKey = 'secrets:S6290';

    await vscode.commands.executeCommand('SonarLint.AllRules.focus');

    await vscode.commands.executeCommand('SonarLint.OpenRuleByKey', secretsAwsRuleKey);

    await vscode.commands.executeCommand('SonarLint.OpenStandaloneRuleDesc', secretsAwsRuleKey);

    await vscode.commands.executeCommand('SonarLint.DeactivateRule', secretsAwsRuleKey);

    const rulesAfterDeactivation = vscode.workspace.getConfiguration('sonarlint').get('rules');
    expect(rulesAfterDeactivation[secretsAwsRuleKey].level).to.equal('off');

    await vscode.commands.executeCommand('SonarLint.ActivateRule', secretsAwsRuleKey);

    const rulesAfterReactivation = vscode.workspace.getConfiguration('sonarlint').get('rules');
    expect(rulesAfterReactivation[secretsAwsRuleKey].level).to.equal('on');

  }).timeout(10_000);

  suiteTeardown('reset rules settings', async () => {
    await vscode.workspace.getConfiguration('sonarlint').update('rules', undefined, vscode.ConfigurationTarget.Global);
  });
});
