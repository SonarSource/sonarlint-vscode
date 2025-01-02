/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { expect } from 'chai';
import * as vscode from 'vscode';
import { allFalse, allTrue } from '../../src/rules/rules';

suite('SonarLint Rules view', () => {
  suiteSetup('reset rules settings', async () => {
    await vscode.workspace.getConfiguration('sonarlint').update('rules', undefined, vscode.ConfigurationTarget.Global);
  });

  test('should show the whole list of rules grouped by language', async function() {

    const secretsAwsRuleKey = 'secrets:S6290';
    // For the rule toggling actions, we use the TreeNode path to avoid notifications
    const secretsAwsRuleAsNode = { rule: { key: secretsAwsRuleKey, activeByDefault: true }};

    await vscode.commands.executeCommand('SonarLint.AllRules.focus');

    await vscode.commands.executeCommand('SonarLint.OpenRuleByKey', secretsAwsRuleKey);

    await vscode.commands.executeCommand('SonarLint.OpenStandaloneRuleDesc', secretsAwsRuleKey);

    await vscode.commands.executeCommand('SonarLint.DeactivateRule', secretsAwsRuleAsNode);

    const rulesAfterDeactivation = vscode.workspace.getConfiguration('sonarlint').get('rules');
    expect(rulesAfterDeactivation[secretsAwsRuleKey].level).to.equal('off');

    await vscode.commands.executeCommand('SonarLint.ActivateRule', secretsAwsRuleAsNode);

    const rulesAfterReactivation = vscode.workspace.getConfiguration('sonarlint').get('rules');
    expect(rulesAfterReactivation[secretsAwsRuleKey]).to.be.undefined;

  }).timeout(10_000);

  suite('allTrue', () => {
    test('should return false on empty', () => {
      expect(allTrue([])).to.be.false;
    });
    test('should return false on array that contains at least one false', () => {
      expect(allTrue([ true, false, true ])).to.be.false;
    });
    test('should return true on array that contains all true', () => {
      expect(allTrue([ true, true, true ])).to.be.true;
    });
  });

  suite('allFalse', () => {
    test('should return true on empty', () => {
      expect(allFalse([])).to.be.true;
    });
    test('should return false on array that contains at least one true', () => {
      expect(allFalse([ true, false, true ])).to.be.false;
    });
    test('should return false on array that contains all false', () => {
      expect(allFalse([ false, false, false ])).to.be.true;
    });
  });

  suiteTeardown('reset rules settings', async () => {
    await vscode.workspace.getConfiguration('sonarlint').update('rules', undefined, vscode.ConfigurationTarget.Global);
  });
});
