/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import { ConnectionSettingsService, migrateConnectedModeSettings } from './connectionsettings';
import { JAVA_HOME_SUBKEY, validateJavaHome } from '../util/requirements';

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
  vscode.window.showInformationMessage('SonarQube for IDE: Verbose logging enabled.');
}

export function loadInitialSettings() {
  currentConfig = getSonarLintConfiguration();
}

export function getCurrentConfiguration() {
  return currentConfig;
}

export function onConfigurationChange() {
  return vscode.workspace.onDidChangeConfiguration(async event => {
    if (!event.affectsConfiguration('sonarlint')) {
      return;
    }
    const oldConfig = currentConfig;
    const newConfig = getSonarLintConfiguration();

    const sonarLintLsConfigChanged = hasSonarLintLsConfigChanged(oldConfig, newConfig);

    if (sonarLintLsConfigChanged) {
      const newJavaHome = newConfig.get<string>(JAVA_HOME_SUBKEY);
      const javaHomeChanged = !configKeyEquals(JAVA_HOME_SUBKEY, oldConfig, newConfig);
      if (javaHomeChanged && newJavaHome) {
        const errorMessage = await validateJavaHome(newJavaHome);
        if (errorMessage) {
          vscode.window.showErrorMessage(errorMessage);
          return;
        }
      }

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
  return !configKeyEquals(JAVA_HOME_SUBKEY, oldConfig, newConfig) || !configKeyEquals('ls.vmargs', oldConfig, newConfig);
}

function configKeyEquals(key, oldConfig, newConfig) {
  return oldConfig.get(key) === newConfig.get(key);
}

export function shouldShowRegionSelection() {
  return getSonarLintConfiguration().get("earlyAccess.showRegionSelection", false);
}

export function isFocusingOnNewCode(): boolean {
  return getSonarLintConfiguration().get('focusOnNewCode', false);
}
