/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

'use strict';

import * as VSCode from 'vscode';
import { ServerType } from '../connected/connections';
import { BindingSuggestion, ServerProject } from '../lsp/protocol';
import { SonarCloudRegion } from '../settings/connectionsettings';

const EU_SONARCLOUD_BASE_URL = 'https://sonarcloud.io';
const US_SONARCLOUD_BASE_URL = 'https://sonarqube.us';

export const SONARCLOUD_REGION_URL_MAP: Record<SonarCloudRegion, string> = {
  'EU': EU_SONARCLOUD_BASE_URL,
  'US': US_SONARCLOUD_BASE_URL
};

export function serverProjectsToQuickPickItems(serverProjects: BindingSuggestion[], serverType: ServerType) {
  const itemsList: VSCode.QuickPickItem[] = [];
  if (serverProjects) {
    for (const project of serverProjects) {
      itemsList.push(projectToQuickPickItem({ key: project.sonarProjectKey, name: project.sonarProjectName }, serverType));
    }
  }
  return itemsList;
}

export function projectToQuickPickItem(project: ServerProject, serverType: ServerType): VSCode.QuickPickItem {
  return {
    label: project.name,
    description: project.key,
    buttons: [{ iconPath: new VSCode.ThemeIcon('link-external'), tooltip: `View in ${serverType}` }]
  };
}

export function buildProjectOverviewBaseServerUrl(serverType: ServerType, serverUrlOrOrganizationKey: string, region?: SonarCloudRegion) {
  if (serverType === ServerType.SonarCloud) {
   const cloudUrl = region ? SONARCLOUD_REGION_URL_MAP[region] : SONARCLOUD_REGION_URL_MAP['EU'];
    return `${cloudUrl}/project/overview`;
  }
  return `${serverUrlOrOrganizationKey}/dashboard`;
}

export interface AutoBindProjectQuickPickItem extends VSCode.QuickPickItem {
  connectionId?: string;
}
