/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import { SonarCloudRegion } from '../settings/connectionsettings';
import { ConnectionSuggestion } from '../lsp/protocol';

export interface CustomQuickPickItem extends vscode.QuickPickItem {
  data?: {region?: SonarCloudRegion};
}

export function deduplicateSuggestions(suggestions: Array<ConnectionSuggestion>) {
    return Array.from(new Set(suggestions.map(s => JSON.stringify(s.connectionSuggestion)))).map(s => JSON.parse(s));
}
