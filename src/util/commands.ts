/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
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

  export const DEACTIVATE_RULE = 'SonarLint.DeactivateRule';
  export const ACTIVATE_RULE = 'SonarLint.ActivateRule';
  export const SHOW_ALL_RULES = 'SonarLint.ShowAllRules';
  export const SHOW_ACTIVE_RULES = 'SonarLint.ShowActiveRules';
  export const SHOW_INACTIVE_RULES = 'SonarLint.ShowInactiveRules';
  export const SHOW_SONARLINT_OUTPUT = 'SonarLint.ShowSonarLintOutput';
  export const OPEN_RULE_BY_KEY = 'SonarLint.OpenRuleByKey';
  export const FIND_RULE_BY_KEY = 'SonarLint.FindRuleByKey';
  export const SHOW_ALL_LOCATIONS = 'SonarLint.ShowAllLocations';
  export const CLEAR_LOCATIONS = 'SonarLint.ClearLocations';
  export const NAVIGATE_TO_LOCATION = 'SonarLint.NavigateToLocation';

  export const INSTALL_MANAGED_JRE = 'SonarLint.InstallManagedJre';

  export const HIDE_HOTSPOT = 'SonarLint.HideHotspot';
  export const SHOW_HOTSPOT_DESCRIPTION = 'SonarLint.ShowHotspotDescription';
  export const CONFIGURE_COMPILATION_DATABASE = 'SonarLint.ConfigureCompilationDatabase';

  export const CONNECT_TO_SONARQUBE = 'SonarLint.ConnectToSonarQube';
  export const CONNECT_TO_SONARCLOUD = 'SonarLint.ConnectToSonarCloud';
  export const EDIT_SONARQUBE_CONNECTION = 'SonarLint.EditSonarQubeConnection';
  export const EDIT_SONARCLOUD_CONNECTION = 'SonarLint.EditSonarCloudConnection';
  export const REMOVE_CONNECTION = 'SonarLint.RemoveConnection';

  export const ADD_PROJECT_BINDING = 'SonarLint.AddProjectBinding';
  export const EDIT_PROJECT_BINDING = 'SonarLint.EditProjectBinding';
  export const REMOVE_PROJECT_BINDING = 'SonarLint.RemoveProjectBinding';

  export const SHOW_HOTSPOT_LOCATION = 'SonarLint.ShowHotspotLocation';
  export const SHOW_HOTSPOT_RULE_DESCRIPTION = 'SonarLint.ShowHotspotRuleDescription';
  export const SHOW_HOTSPOT_DETAILS = 'SonarLint.ShowHotspotDetails';
  export const OPEN_HOTSPOT_ON_SERVER = 'SonarLint.OpenHotspotOnServer';
  export const HIGHLIGHT_REMOTE_HOTSPOT_LOCATION = 'SonarLint.HighlightRemoteHotspotLocation';
  export const CLEAR_HOTSPOT_HIGHLIGHTING = 'SonarLint.ClearHotspotLocations';
  export const SHOW_HOTSPOTS_IN_OPEN_FILES = 'SonarLint.ShowHotspotsInOpenFiles';
  export const SCAN_FOR_HOTSPOTS_IN_FOLDER = 'SonarLint.ScanForHotspotsInFolder';
  export const FORGET_FOLDER_HOTSPOTS = 'SonarLint.ForgetFolderHotspots';

  export const RESOLVE_ISSUE = 'SonarLint.ResolveIssue';
  export const REOPEN_LOCAL_ISSUES = 'SonarLint.ReopenLocalIssues';
  export const TRIGGER_HELP_AND_FEEDBACK_LINK = 'SonarLint.HelpAndFeedbackLinkClicked';
  export const CHANGE_HOTSPOT_STATUS = 'SonarLint.ChangeHotspotStatus';
  export const ENABLE_VERBOSE_LOGS = 'SonarLint.EnableVerboseLogs';
  export const ANALYSE_OPEN_FILE = 'SonarLint.AnalyseOpenFile';
  export const NEW_CODE_DEFINITION = 'SonarLint.NewCodeDefinition';
}
