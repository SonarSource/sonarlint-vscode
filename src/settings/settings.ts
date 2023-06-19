/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import { ConnectionSettingsService, migrateConnectedModeSettings } from './connectionsettings';

let currentConfig: vscode.WorkspaceConfiguration;

export const SONARLINT_CATEGORY = 'sonarlint';
export const VERBOSE_LOGS = 'output.showVerboseLogs';

export function getSonarLintConfiguration(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration(SONARLINT_CATEGORY);
}

export function isVerboseEnabled(): boolean {
  return getCurrentConfiguration()?.get(VERBOSE_LOGS, false);
}

export function enableVerboseLogs() {
  getCurrentConfiguration()?.update(VERBOSE_LOGS, true, vscode.ConfigurationTarget.Global);
  vscode.window.showInformationMessage('Verbose logging enabled.');
}

export function loadInitialSettings() {
  currentConfig = getSonarLintConfiguration();
}

export function getCurrentConfiguration() {
  return currentConfig;
}

export function onConfigurationChange() {
  return vscode.workspace.onDidChangeConfiguration(event => {
    if (!event.affectsConfiguration('sonarlint')) {
      return;
    }
    const newConfig = getSonarLintConfiguration();

    const sonarLintLsConfigChanged =
      hasSonarLintLsConfigChanged(currentConfig, newConfig) || hasNodeJsConfigChanged(currentConfig, newConfig);

    if (sonarLintLsConfigChanged) {
      const msg = 'SonarLint Language Server configuration changed, please restart VS Code.';
      const action = 'Restart Now';
      const restartId = 'workbench.action.reloadWindow';
      currentConfig = newConfig;
      vscode.window.showWarningMessage(msg, action).then(selection => {
        if (action === selection) {
          vscode.commands.executeCommand(restartId);
        }
      });
    }
    migrateConnectedModeSettings(newConfig, ConnectionSettingsService.instance);
  });
}

function hasSonarLintLsConfigChanged(oldConfig, newConfig) {
  return !configKeyEquals('ls.javaHome', oldConfig, newConfig) || !configKeyEquals('ls.vmargs', oldConfig, newConfig);
}

function hasNodeJsConfigChanged(oldConfig, newConfig) {
  return !configKeyEquals('pathToNodeExecutable', oldConfig, newConfig);
}

function configKeyEquals(key, oldConfig, newConfig) {
  return oldConfig.get(key) === newConfig.get(key);
}
