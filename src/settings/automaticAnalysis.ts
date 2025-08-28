/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import { FindingsTreeViewItem } from '../findings/findingsTreeDataProvider';

export class AutomaticAnalysisService {
  public constructor(private readonly statusBarItem: vscode.StatusBarItem,
    private readonly findingsView: vscode.TreeView<FindingsTreeViewItem>,
  ) {
  }  

  updateAutomaticAnalysisStatusBarAndFindingsViewMessage() {
    const isEnabled = vscode.workspace.getConfiguration('sonarlint').get('automaticAnalysis', true);
    const icon = isEnabled ? '$(circle-filled)' : '$(circle-outline)';
    const status = isEnabled ? 'enabled' : 'disabled';
    const action = isEnabled ? 'disable' : 'enable';
    const command = isEnabled ? 'SonarLint.AutomaticAnalysis.Disable' : 'SonarLint.AutomaticAnalysis.Enable';
    
    this.statusBarItem.text = `${icon} SonarQube`;
    this.statusBarItem.tooltip = `Automatic analysis is ${status}. Click to ${action}.`;
    this.statusBarItem.command = command;
    
    // Update findings view message
    if (isEnabled) {
      this.findingsView.message = undefined;
    } else {
      this.findingsView.message = 'ⓘ Automatic analysis is disabled. The findings list might not be up to date.';
    }
  }
}
