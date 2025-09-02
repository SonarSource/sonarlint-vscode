/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import { expect } from 'chai';
import { AutomaticAnalysisService } from '../../src/settings/automaticAnalysis';
import { FindingsTreeViewItem } from '../../src/findings/findingsTreeDataProvider';

suite('AutomaticAnalysisService Test Suite', () => {
  
  let statusBarItem: vscode.StatusBarItem;
  let findingsView: vscode.TreeView<FindingsTreeViewItem>;
  let automaticAnalysisService: AutomaticAnalysisService;
  
  setup(async () => {
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
    
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
    
    automaticAnalysisService = new AutomaticAnalysisService(statusBarItem, findingsView);
    
    await vscode.workspace
      .getConfiguration('sonarlint')
      .update('automaticAnalysis', undefined, vscode.ConfigurationTarget.Global);
  });

  teardown(async () => {
    statusBarItem.dispose();
    await vscode.workspace
      .getConfiguration('sonarlint')
      .update('automaticAnalysis', undefined, vscode.ConfigurationTarget.Global);
  });


  test('should use default value when configuration is not set', () => {
    automaticAnalysisService.updateAutomaticAnalysisStatusBarAndFindingsViewMessage();

    expect(statusBarItem.text).to.equal('$(circle-filled) SonarQube');
    expect(statusBarItem.tooltip).to.equal('Automatic analysis is enabled. Click to disable.');
    expect(statusBarItem.command).to.equal('SonarLint.AutomaticAnalysis.Disable');
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
    expect(statusBarItem.text).to.equal('$(circle-filled) SonarQube');
    expect(statusBarItem.tooltip).to.equal('Automatic analysis is enabled. Click to disable.');
    expect(statusBarItem.command).to.equal('SonarLint.AutomaticAnalysis.Disable');
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
    expect(statusBarItem.text).to.equal('$(circle-outline) SonarQube');
    expect(statusBarItem.tooltip).to.equal('Automatic analysis is disabled. Click to enable.');
    expect(statusBarItem.command).to.equal('SonarLint.AutomaticAnalysis.Enable');
  });
});
