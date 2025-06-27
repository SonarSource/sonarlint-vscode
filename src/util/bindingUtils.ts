/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

'use strict';

import * as VSCode from 'vscode';
import { ServerType } from '../connected/connections';
import { BindingSuggestion } from '../lsp/protocol';
import { ProjectBinding } from '../connected/binding';
import { SONARLINT_CATEGORY } from '../settings/settings';

export function serverProjectsToQuickPickItems(serverProjects: BindingSuggestion[], serverType: ServerType) {
  const itemsList: VSCode.QuickPickItem[] = [];
  if (serverProjects) {
    for (const project of serverProjects) {
      itemsList.push({
        label: project.sonarProjectName,
        description: project.sonarProjectKey,
        buttons: [
          {
            iconPath: new VSCode.ThemeIcon('link-external'),
            tooltip: `View in ${serverType}`
          }
        ]
      } as AutoBindProjectQuickPickItem);
    }
  }
  return itemsList;
}

export function buildBaseServerUrl(serverType: ServerType, serverUrlOrOrganizationKey: string) {
  return serverType === 'SonarQube'
    ? `${serverUrlOrOrganizationKey}/dashboard`
    : 'https://sonarcloud.io/project/overview';
}

export interface AutoBindProjectQuickPickItem extends VSCode.QuickPickItem {
  connectionId?: string;
}

export function getConnectionIdForFile(fileUri: string) {
  const workspaceFolder = VSCode.workspace.getWorkspaceFolder(VSCode.Uri.file(fileUri));
  const bindingConfig = VSCode.workspace.getConfiguration(SONARLINT_CATEGORY, workspaceFolder?.uri)
    .get<ProjectBinding>('connectedMode.project');
  return bindingConfig?.connectionId ?? '';
}
