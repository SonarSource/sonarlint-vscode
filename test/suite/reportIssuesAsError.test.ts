/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { setReportIssuesAsOverride } from '../../src/extension';
import { REPORT_ISSUES_AS_ERROR_OVERRIDES } from '../../src/settings/settings';
import { sleep } from '../testutil';

suite('setReportIssuesAsOverride', () => {
  let showInformationMessageStub: sinon.SinonStub;

  setup(() => {
    showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage').resolves();
  });
  
  teardown(async () => {
    showInformationMessageStub.restore();
    
    await vscode.workspace.getConfiguration('sonarlint')
      .update(REPORT_ISSUES_AS_ERROR_OVERRIDES, undefined, vscode.ConfigurationTarget.Global);
  });

  test('should set rule override to Error level', async () => {
    const ruleKey = 'test-rule-key';
    const overrideFunction = setReportIssuesAsOverride('Error');
    
    await overrideFunction(ruleKey);
    
    // Small delay to allow configuration to propagate
    await sleep(100);
    
    const config = vscode.workspace.getConfiguration('sonarlint');
    const overrides = config.get(REPORT_ISSUES_AS_ERROR_OVERRIDES, {});
    

    assert.strictEqual(overrides[ruleKey], 'Error');
  });

  test('should set rule override to Warning level', async () => {
    const ruleKey = 'another-rule-key';
    const overrideFunction = setReportIssuesAsOverride('Warning');
    
    await overrideFunction(ruleKey);
    
    // Small delay to allow configuration to propagate
    await sleep(100);
    
    const config = vscode.workspace.getConfiguration('sonarlint');
    const overrides = config.get(REPORT_ISSUES_AS_ERROR_OVERRIDES, {});
    

    assert.strictEqual(overrides[ruleKey], 'Warning');
  });

  test('should preserve existing overrides when adding new one', async () => {
    const existingRuleKey = 'existing-rule';
    const newRuleKey = 'new-rule';
    
    const config = vscode.workspace.getConfiguration('sonarlint');
    await config.update(REPORT_ISSUES_AS_ERROR_OVERRIDES, { [existingRuleKey]: 'Warning' }, vscode.ConfigurationTarget.Global);
    
    // Small delay after initial setup
    await sleep(100);
    
    const overrideFunction = setReportIssuesAsOverride('Error');
    await overrideFunction(newRuleKey);
    
    // Small delay after function call
    await sleep(100);
    
    const freshConfig = vscode.workspace.getConfiguration('sonarlint');
    const updatedOverrides = freshConfig.get(REPORT_ISSUES_AS_ERROR_OVERRIDES, {});
    
    assert.strictEqual(updatedOverrides[existingRuleKey], 'Warning');
    assert.strictEqual(updatedOverrides[newRuleKey], 'Error');
  });

  test('should overwrite existing rule override', async () => {
    const ruleKey = 'same-rule-key';
    
    const warningFunction = setReportIssuesAsOverride('Warning');
    await warningFunction(ruleKey);
    
    // Small delay after first call
    await sleep(100);

    const errorFunction = setReportIssuesAsOverride('Error');
    await errorFunction(ruleKey);
    
    // Small delay after second call
    await sleep(100);
    
    const config = vscode.workspace.getConfiguration('sonarlint');
    const overrides = config.get(REPORT_ISSUES_AS_ERROR_OVERRIDES, {});
    
    assert.strictEqual(overrides[ruleKey], 'Error');
  });
});