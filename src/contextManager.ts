/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import { BindingService } from './connected/binding';
import { allFalse, allTrue } from './rules/rules';

const ONLY_CONNECTED_MODE_CONTEXT_KEY = 'sonarqube.onlyConnectedMode';
const ONLY_STANDALONE_MODE_CONTEXT_KEY = 'sonarqube.onlyStandaloneMode';

export class ContextManager {
  private static _instance: ContextManager;

  static init(): void {
    ContextManager._instance = new ContextManager();
  }

  static get instance(): ContextManager {
    return ContextManager._instance;
  }

  setConnectedModeContext() {
    const folderBindingStates = [...BindingService.instance.bindingStatePerFolder().values()];
    if (allTrue(folderBindingStates)) {
      // All folders are bound; Show hotspots view and hide rules view
      vscode.commands.executeCommand('setContext', ONLY_CONNECTED_MODE_CONTEXT_KEY, true);
      vscode.commands.executeCommand('setContext', ONLY_STANDALONE_MODE_CONTEXT_KEY, false);
    } else if (allFalse(folderBindingStates)) {
      // No folders are bound; Show rules view and hide hotspots view
      vscode.commands.executeCommand('setContext', ONLY_CONNECTED_MODE_CONTEXT_KEY, false);
      vscode.commands.executeCommand('setContext', ONLY_STANDALONE_MODE_CONTEXT_KEY, true);
    } else {
      // Some folders are bound and some are not; Show both views; Should be a corner case
      vscode.commands.executeCommand('setContext', ONLY_CONNECTED_MODE_CONTEXT_KEY, true);
      vscode.commands.executeCommand('setContext', ONLY_STANDALONE_MODE_CONTEXT_KEY, true);
    }
  }

}