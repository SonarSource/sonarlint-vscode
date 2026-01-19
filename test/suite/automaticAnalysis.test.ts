/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import { expect } from 'chai';
import { AutomaticAnalysisService } from '../../src/settings/automaticAnalysis';
import { FindingsTreeViewItem } from '../../src/findings/findingsTreeDataProvider';
import { SETUP_TEARDOWN_HOOK_TIMEOUT } from './commons';

suite('AutomaticAnalysisService Test Suite', () => {
  
  let findingsView: vscode.TreeView<FindingsTreeViewItem>;
  let automaticAnalysisService: AutomaticAnalysisService;
  
  setup(async function () {
    this.timeout(SETUP_TEARDOWN_HOOK_TIMEOUT);
    
    findingsView = {
      message: undefined,
      visible: true,
      selection: [],
      reveal: () => Promise.resolve(),
      dispose: () => {},
      onDidChangeSelection: new vscode.EventEmitter<vscode.TreeViewSelectionChangeEvent<FindingsTreeViewItem>>().event,
      onDidChangeVisibility: new vscode.EventEmitter<vscode.TreeViewVisibilityChangeEvent>().event,
      onDidCollapseElement: new vscode.EventEmitter<vscode.TreeViewExpansionEvent<FindingsTreeViewItem>>().event,
      onDidExpandElement: new vscode.EventEmitter<vscode.TreeViewExpansionEvent<FindingsTreeViewItem>>().event,
      onDidChangeCheckboxState: new vscode.EventEmitter<vscode.TreeCheckboxChangeEvent<FindingsTreeViewItem>>().event
    } as vscode.TreeView<FindingsTreeViewItem>;
    
    automaticAnalysisService = new AutomaticAnalysisService(findingsView);
    
    await vscode.workspace
      .getConfiguration('sonarlint')
      .update('automaticAnalysis', undefined, vscode.ConfigurationTarget.Global);
  });

  teardown(async function () {
    this.timeout(SETUP_TEARDOWN_HOOK_TIMEOUT);
    await vscode.workspace
      .getConfiguration('sonarlint')
      .update('automaticAnalysis', undefined, vscode.ConfigurationTarget.Global);
  });


  test('should use default value when configuration is not set', () => {
    automaticAnalysisService.updateAutomaticAnalysisStatusBarAndFindingsViewMessage();

    expect(findingsView.message).to.be.undefined;
  });

  test('should clear findings view message and update status bar when analysis is enabled', async () => {
    // Start with disabled (message set)
    await vscode.workspace
      .getConfiguration('sonarlint')
      .update('automaticAnalysis', false, vscode.ConfigurationTarget.Global);
    
    automaticAnalysisService.updateAutomaticAnalysisStatusBarAndFindingsViewMessage();
    expect(findingsView.message).to.not.be.undefined;

    // Change to enabled
    await vscode.workspace
      .getConfiguration('sonarlint')
      .update('automaticAnalysis', true, vscode.ConfigurationTarget.Global);
    
    automaticAnalysisService.updateAutomaticAnalysisStatusBarAndFindingsViewMessage();

    // Message should be cleared
    expect(findingsView.message).to.be.undefined;
  });

  test('should set findings view message and update status bar when analysis is disabled', async () => {
    // Start with enabled (no message)
    await vscode.workspace
      .getConfiguration('sonarlint')
      .update('automaticAnalysis', true, vscode.ConfigurationTarget.Global);
    
    automaticAnalysisService.updateAutomaticAnalysisStatusBarAndFindingsViewMessage();
    expect(findingsView.message).to.be.undefined;

    // Change to disabled
    await vscode.workspace
      .getConfiguration('sonarlint')
      .update('automaticAnalysis', false, vscode.ConfigurationTarget.Global);
    
    automaticAnalysisService.updateAutomaticAnalysisStatusBarAndFindingsViewMessage();

    expect(findingsView.message).to.equal('ⓘ Automatic analysis is disabled. The findings list might not be up to date.');
  });
});
