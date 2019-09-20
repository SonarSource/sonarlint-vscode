/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2019 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

/**
 * Commonly used commands
 */
export namespace Commands {
  /**
   * Open Browser
   */
  export const OPEN_BROWSER = 'vscode.open';

  /**
   * Open settings.json
   */
  export const OPEN_JSON_SETTINGS = 'workbench.action.openSettingsJson';

  /**
   * Open settings
   */
  export const OPEN_SETTINGS = 'workbench.action.openSettings';

  export const UPDATE_SERVERS_AND_BINDING_STORAGE = 'SonarLint.updateServersAndBinding';
  export const OPEN_RULE_DESCRIPTION = 'SonarLint.OpenRuleDesc';
  export const DEACTIVATE_RULE = 'SonarLint.DeactivateRule';
  export const ACTIVATE_RULE = 'SonarLint.ActivateRule';
  export const SHOW_ALL_RULES = 'SonarLint.ShowAllRules';
  export const SHOW_ACTIVE_RULES = 'SonarLint.ShowActiveRules';
  export const SHOW_INACTIVE_RULES = 'SonarLint.ShowInactiveRules';
  export const FIND_RULE_BY_KEY = 'SonarLint.FindRuleByKey';
}
