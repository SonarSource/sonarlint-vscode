/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import { BindingService } from './connected/binding';
import { allFalse, allTrue } from './rules/rules';
import { ConnectionSettingsService } from './settings/connectionsettings';
import { HAS_CLICKED_GET_STARTED_LINK } from './commons'
import { getCurrentAgentWithMCPSupport } from './aiAgentsConfiguration/aiAgentUtils';
import { IdeLabsFlagManagementService } from './labs/ideLabsFlagManagementService';

const SOME_CONNECTED_MODE_CONTEXT_KEY = 'sonarqube.someFoldersUseConnectedMode';
const SOME_STANDALONE_MODE_CONTEXT_KEY = 'sonarqube.someFoldersUseStandaloneMode';
const HAS_EXPLORED_ISSUE_LOCATIONS_CONTEXT_KEY = 'sonarqube.hasExploredIssueLocations';
const SHOULD_SHOW_GET_STARTED_VIEW = 'sonarqube.shouldShowGetStartedView';
const FLIGHT_RECORDER_RUNNING = 'sonarqube.flightRecorderRunning';
const MCP_SERVER_SUPPORTED_AGENT = 'sonarqube.mcpServerSupportedAgent';
const IDE_LABS_ENABLED_FLAG_KEY = 'sonarqube.ideLabsEnabled';
const COPILOT_ACTIVATION_DELAY_MS = 10000;

export class ContextManager {
  private static _instance: ContextManager;

  static get instance(): ContextManager {
    if (!ContextManager._instance) {
      ContextManager._instance = new ContextManager();
    }
    return ContextManager._instance;
  }

  initializeContext(context: vscode.ExtensionContext) {
    this.setGetStartedViewContext(context);
    const folderBindingStates = [...BindingService.instance.bindingStatePerFolder().values()];
    if (allTrue(folderBindingStates)) {
      // All folders are bound; Show hotspots view and hide rules view
      vscode.commands.executeCommand('setContext', SOME_CONNECTED_MODE_CONTEXT_KEY, true);
      vscode.commands.executeCommand('setContext', SOME_STANDALONE_MODE_CONTEXT_KEY, false);
    } else if (allFalse(folderBindingStates)) {
      // No folders are bound; Show rules view and hide hotspots view
      vscode.commands.executeCommand('setContext', SOME_CONNECTED_MODE_CONTEXT_KEY, false);
      vscode.commands.executeCommand('setContext', SOME_STANDALONE_MODE_CONTEXT_KEY, true);
    } else {
      // Some folders are bound and some are not; Show both views; Should be a corner case
      vscode.commands.executeCommand('setContext', SOME_CONNECTED_MODE_CONTEXT_KEY, true);
      vscode.commands.executeCommand('setContext', SOME_STANDALONE_MODE_CONTEXT_KEY, true);
    }

    this.initializeIdeLabsContext();

    setTimeout(() => {
      this.setMCPServerSupportedAgentContext();
    }, COPILOT_ACTIVATION_DELAY_MS);
  }

  setMCPServerSupportedAgentContext() {
    const isSupportedAgent = getCurrentAgentWithMCPSupport() !== undefined;
    vscode.commands.executeCommand('setContext', MCP_SERVER_SUPPORTED_AGENT, isSupportedAgent);
  }

  setIssueLocationsContext() {
    vscode.commands.executeCommand('setContext', HAS_EXPLORED_ISSUE_LOCATIONS_CONTEXT_KEY, true);
  }

  setGetStartedViewContext(context: vscode.ExtensionContext) {
    const hasConnectionConfigured = ConnectionSettingsService.instance.hasConnectionConfigured();
    const hasClickedGetStartedLink = context.globalState.get(HAS_CLICKED_GET_STARTED_LINK, false);
    // only show the get started view if user has no connection AND has not clicked the link
    vscode.commands.executeCommand('setContext', SHOULD_SHOW_GET_STARTED_VIEW, !hasConnectionConfigured && !hasClickedGetStartedLink);
  }

  setFlightRecorderRunningContext() {
    vscode.commands.executeCommand('setContext', FLIGHT_RECORDER_RUNNING, true);
  }

  initializeIdeLabsContext() {
    const enabled = IdeLabsFlagManagementService.instance.isIdeLabsEnabled();
    this.setIdeLabsContext(enabled);
  }

  setIdeLabsContext(enabled: boolean) {
    vscode.commands.executeCommand('setContext', IDE_LABS_ENABLED_FLAG_KEY, enabled);
  }

  resetAllContexts() {
    vscode.commands.executeCommand('setContext', SOME_CONNECTED_MODE_CONTEXT_KEY, undefined);
    vscode.commands.executeCommand('setContext', SOME_STANDALONE_MODE_CONTEXT_KEY, undefined);
    vscode.commands.executeCommand('setContext', HAS_EXPLORED_ISSUE_LOCATIONS_CONTEXT_KEY, undefined);
    vscode.commands.executeCommand('setContext', SHOULD_SHOW_GET_STARTED_VIEW, undefined);
    vscode.commands.executeCommand('setContext', FLIGHT_RECORDER_RUNNING, undefined);
    vscode.commands.executeCommand('setContext', MCP_SERVER_SUPPORTED_AGENT, undefined);
  }

}
