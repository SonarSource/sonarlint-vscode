/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import { FindingsTreeViewItem } from '../findings/findingsTreeDataProvider';
import { StatusBarService } from '../statusbar/statusBar';

export class AutomaticAnalysisService {
  public constructor(
    private readonly findingsView: vscode.TreeView<FindingsTreeViewItem>,
  ) {
  }

  updateAutomaticAnalysisStatusBarAndFindingsViewMessage() {
    const isEnabled = vscode.workspace.getConfiguration('sonarlint').get('automaticAnalysis', true);

    // Update findings view message
    if (isEnabled) {
      this.findingsView.message = undefined;
    } else {
      this.findingsView.message = 'ⓘ Automatic analysis is disabled. The findings list might not be up to date.';
    }

    // Notify status bar
    StatusBarService.instance.updateAutomaticAnalysis(isEnabled);
  }
}
