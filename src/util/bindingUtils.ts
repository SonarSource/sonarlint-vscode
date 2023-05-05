/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

'use strict';

import * as VSCode from 'vscode';
import { ServerType } from '../connected/connections';
import { BindingSuggestion } from '../lsp/protocol';

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
