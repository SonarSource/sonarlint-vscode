/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

'use strict';

import * as VSCode from 'vscode';
import { ServerProject } from '../connected/binding';
import { ServerType } from '../connected/connections';
import { BaseConnection, SonarCloudConnection, SonarQubeConnection } from '../settings/connectionsettings';

export function getBestHitsForConnections(
  connectionToServerProjects: Map<BaseConnection, ServerProject[]>,
  unboundFolder: VSCode.WorkspaceFolder
): Map<BaseConnection, MatchHit[]> {
  const folderName = unboundFolder.name;
  const workspaceName = VSCode.workspace.name;
  const folderNameTokens = [...tokenizeString(folderName)];
  const workspaceNameTokens = [...tokenizeString(workspaceName)];
  const connectionToBestHits = new Map<BaseConnection, MatchHit[]>();
  for (const [connection, projects] of connectionToServerProjects) {
    let bestHits: MatchHit[] = [];
    bestHits.push({ hits: 0, projectKey: '', projectName: '', connection: { connectionId: '' } });
    for (const project of projects) {
      const projectKey = project.key;
      const projectName = project.name;
      const serverProjectString = (projectKey + projectName).toLowerCase();
      const folderNameHits = getHits(folderNameTokens, serverProjectString);
      const workspaceNameHits = getHits(workspaceNameTokens, serverProjectString);
      const bestHitCount = bestHits[0].hits;
      if (folderNameHits >= bestHitCount || workspaceNameHits >= bestHitCount) {
        bestHits = updateBestHits(bestHits, folderNameHits, workspaceNameHits, projectKey, projectName, connection);
      }
    }
    if (bestHits[0].hits > 0) {
      connectionToBestHits.set(connection, bestHits);
    }
  }
  return connectionToBestHits;
}

function getHits(localTokens: string[], serverProjectString: string): number {
  let hits = 0;
  for (const localToken of localTokens) {
    if (serverProjectString.includes(localToken)) {
      hits++;
    }
  }
  return hits;
}

function updateBestHits(
  bestHits: MatchHit[],
  folderNameHits: number,
  workspaceNameHits: number,
  projectKey: string,
  projectName: string,
  connection: BaseConnection
) {
  const previousHitCount = bestHits[0].hits;
  const newHitCount = folderNameHits > workspaceNameHits ? folderNameHits : workspaceNameHits;
  return updateHits(newHitCount, previousHitCount, bestHits, projectKey, projectName, connection);
}

function updateHits(
  hits: number,
  bestHitCount: number,
  bestHits: MatchHit[],
  projectKey: string,
  projectName: string,
  connection: BaseConnection
) {
  const bestHit = {
    hits,
    projectKey,
    projectName,
    connection
  };
  if (hits === bestHitCount) {
    bestHits.push(bestHit);
  } else {
    bestHits = [];
    bestHits.push(bestHit);
  }
  return bestHits;
}

export function getQuickPickItemsToAutoBind(connectionToBestHits: Map<BaseConnection, MatchHit[]>) {
  const itemsList: VSCode.QuickPickItem[] = [];
  for (const [connection, hits] of connectionToBestHits) {
    const connectionServerType = getServerType(connection);
    const connectionDisplayName = getDisplayName(connection);
    itemsList.push({ label: connectionDisplayName, kind: VSCode.QuickPickItemKind.Separator });
    for (const hit of hits) {
      itemsList.push({
        label: `${connectionDisplayName} - ${hit.projectKey}`,
        description: hit.projectKey,
        connectionId: connection.connectionId,
        buttons: [
          {
            iconPath: new VSCode.ThemeIcon('link-external'),
            tooltip: `View in ${connectionServerType}`
          }
        ]
      } as AutoBindProjectQuickPickItem);
    }
  }
  return itemsList;
}

export function serverProjectsToQuickPickItems(serverProjects: MatchHit[], serverType: ServerType) {
  const itemsList: VSCode.QuickPickItem[] = [];
  if (serverProjects) {
    for (const project of serverProjects) {
      itemsList.push({
        label: project.projectName,
        description: project.projectKey,
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

/**
 * Splits string by popular separator symbols: '-', '.', ':' and space
 * @param str - project name, project key, folder name, workspace name
 */
export function tokenizeString(str: string): string[] {
  const tokens = str.split(/[-.: ]/);
  return tokens.map(t => t.toLowerCase());
}

export function getServerType(connection: BaseConnection): ServerType {
  return 'serverUrl' in connection ? 'SonarQube' : 'SonarCloud';
}

export function getDisplayName(connection: BaseConnection): string {
  if (connection.connectionId) {
    return connection.connectionId;
  }
  return getServerUrlOrOrganizationKey(connection);
}

export function getServerUrlOrOrganizationKey(connection: BaseConnection) {
  const serverType = getServerType(connection);
  if (serverType === 'SonarQube') {
    return (connection as SonarQubeConnection).serverUrl;
  }
  return (connection as SonarCloudConnection).organizationKey;
}

export function buildBaseServerUrl(serverType: ServerType, serverUrlOrOrganizationKey: string) {
  return serverType === 'SonarQube'
    ? `${serverUrlOrOrganizationKey}/dashboard`
    : 'https://sonarcloud.io/project/overview';
}

export interface MatchHit {
  hits: number;
  projectKey: string;
  projectName: string;
  connection: BaseConnection;
}

export interface AutoBindProjectQuickPickItem extends VSCode.QuickPickItem {
  connectionId?: string;
}
