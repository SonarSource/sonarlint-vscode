/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2024 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import { connectToSonarCloud, connectToSonarQube } from './connectionsetup';
import { SonarLintExtendedLanguageClient } from "../lsp/client";
import { ConnectionSuggestion } from "../lsp/protocol";
import { ConnectionSettingsService } from "../settings/connectionsettings";
import { logToSonarLintOutput } from '../util/logging';

const MAX_FOLDERS_TO_NOTIFY = 5;
const DO_NOT_ASK_ABOUT_CONNECTION_SETUP_FOR_WORKSPACE = 'doNotAskAboutConnectionSetupForWorkspace';

export class SharedConnectedModeSettingsService {
	private static _instance: SharedConnectedModeSettingsService;

	static init(
	  languageClient: SonarLintExtendedLanguageClient,
	  context: vscode.ExtensionContext,
	  settingsService: ConnectionSettingsService
	): void {
		SharedConnectedModeSettingsService._instance = new SharedConnectedModeSettingsService(languageClient, context, settingsService);
	}

	constructor(
	  private readonly languageClient: SonarLintExtendedLanguageClient,
	  private readonly context: vscode.ExtensionContext,
	  private readonly settingsService: ConnectionSettingsService
	) {}

	static get instance(): SharedConnectedModeSettingsService {
	  return SharedConnectedModeSettingsService._instance;
	}

	handleSuggestConnectionNotification(connectedModeSuggestions: { [configScopeId: string]: Array<ConnectionSuggestion> }) {
		const configScopeIds = Object.keys(connectedModeSuggestions);
		if (configScopeIds.length > MAX_FOLDERS_TO_NOTIFY) {
			logToSonarLintOutput(`Received connection suggestions for too many folders, skipping`);
		}
		configScopeIds.forEach(configScopeId => this.suggestConnectionForConfigScope(configScopeId, connectedModeSuggestions[configScopeId]));
	}

  private async suggestConnectionForConfigScope(configScopeId: string, suggestions: Array<ConnectionSuggestion>) {
    if (this.context.workspaceState.get(DO_NOT_ASK_ABOUT_CONNECTION_SETUP_FOR_WORKSPACE)) {
      // Ignore silently since user asked not to be bothered again
      return;
    }
    const workspaceFolder = tryGetWorkspaceFolder(configScopeId);
    if (workspaceFolder === undefined) {
      logToSonarLintOutput(`Ignoring connection suggestion for unknown folder ${configScopeId}`);
      return;
    }
    if (suggestions.length === 0) {
      logToSonarLintOutput(`Ignoring empty suggestions for ${configScopeId}`);
    } else if (suggestions.length === 1) {
      const { projectKey, serverUrl, organization } = suggestions[0].connectionSuggestion;
      const serverReference = organization ?
        `of SonarCloud organization '${organization}'` :
        `on SonarQube server '${serverUrl}'`;
      const actions = [ 'Use Configuration', 'Bind Project Manually', "Don't Ask Again" ];
      const userAnswer = await vscode.window.showInformationMessage(`A connected mode configuration file is available to bind folder '${workspaceFolder.name}'
        to project '${projectKey}' ${serverReference}. Do you want to use this configuration file to bind this project?`, ...actions);
      switch (userAnswer) {
        case 'Use Configuration':
          if (organization) {
            connectToSonarCloud(this.context)(organization, projectKey, workspaceFolder.uri);
          } else {
            connectToSonarQube(this.context)(serverUrl, projectKey, workspaceFolder.uri);
          }
          break;
        case 'Bind Project Manually':
          // TODO Trigger manual binding process
          break;
        case "Don't Ask Again":
          this.context.workspaceState.update(DO_NOT_ASK_ABOUT_CONNECTION_SETUP_FOR_WORKSPACE, true);
          break;
        default:
          // NOP
      }
    } else {
      // TODO Handle selection between suggestions?
    }
  }
}

function tryGetWorkspaceFolder(configScopeId: string) {
  try {
    return vscode.workspace.getWorkspaceFolder(vscode.Uri.parse(configScopeId));
  } catch(notAuri) {
    return undefined;
  }
}
