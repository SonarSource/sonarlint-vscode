/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2024 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { SonarLintExtendedLanguageClient } from "../lsp/client";
import * as vscode from 'vscode';
import { ConnectionSettingsService } from "../settings/connectionsettings";
import { ConnectionSuggestion } from "../lsp/protocol";

export class SharedConnectedModeSettingsService {
	private static _instance: SharedConnectedModeSettingsService;
  
	static init(
	  languageClient: SonarLintExtendedLanguageClient,
	  workspaceState: vscode.Memento,
	  settingsService: ConnectionSettingsService
	): void {
		SharedConnectedModeSettingsService._instance = new SharedConnectedModeSettingsService(languageClient, workspaceState, settingsService);
	}
  
	constructor(
	  private readonly languageClient: SonarLintExtendedLanguageClient,
	  private readonly workspaceState: vscode.Memento,
	  private readonly settingsService: ConnectionSettingsService
	) {}
  
	static get instance(): SharedConnectedModeSettingsService {
	  return SharedConnectedModeSettingsService._instance;
	}

	handleSuggestConnectionNotification(connectedModeSuggestions: { [folderUri: string]: Array<ConnectionSuggestion> }) {
		vscode.window.showInformationMessage(
			`Thanks for suggesting me to connect to ${JSON.stringify(connectedModeSuggestions)}`);
	}
}