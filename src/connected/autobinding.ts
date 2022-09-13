/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

'use strict';

import * as VSCode from 'vscode';
import { QuickPickItem, QuickPickItemKind } from 'vscode';
import * as properties from 'properties';
import { BindingService, ServerProject } from './binding';
import { BaseConnection, ConnectionSettingsService } from '../settings/connectionsettings';
import { getDisplayName, getServerType, tokenizeString } from '../util/util';
import { Commands } from '../util/commands';

const AUTOBINDING_THRESHOLD = 5;
const ATTEMPT_AUTOBINDING_ACTION = 'Attempt Auto-binding';
const BIND_ACTION = 'Configure Binding';
const CHOOSE_MANUALLY_ACTION = 'Choose Manually';
const DONT_ASK_AGAIN_ACTION = "Don't Ask Again";
export const DO_NOT_ASK_ABOUT_AUTO_BINDING_FOR_WS_FLAG = 'doNotAskAboutAutoBindingForWorkspace';
export const DO_NOT_ASK_ABOUT_AUTO_BINDING_FOR_FOLDER_FLAG = 'doNotAskAboutAutoBindingForFolder';
const DEFAULT_CONNECTION_ID = '<default>';

const ANALYSIS_SETTINGS_FILE_NAMES = ['sonar-project.properties', '.sonarcloud.properties'];

export class AutoBindingService {
  private static _instance: AutoBindingService;

  static init(
    bindingService: BindingService,
    workspaceState: VSCode.Memento,
    settingsService: ConnectionSettingsService
  ): void {
    AutoBindingService._instance = new AutoBindingService(bindingService, workspaceState, settingsService);
  }

  constructor(
    private readonly bindingService: BindingService,
    private readonly workspaceState: VSCode.Memento,
    private readonly settingsService: ConnectionSettingsService
  ) {
  }

  static get instance(): AutoBindingService {
    return AutoBindingService._instance;
  }

  async autoBindWorkspace() {
    if (VSCode.workspace.workspaceFolders) {
      const unboundFolders = VSCode.workspace.workspaceFolders.filter(workspaceFolder =>
        !this.bindingService.isBound(workspaceFolder)
      );
      if (unboundFolders.length > 0) {
        this.autoBindAllFolders(unboundFolders);
      } else {
        VSCode.window.showInformationMessage(`All folders in this workspace are already bound
         to SonarQube or SonarCloud projects`);
      }
    } else {
      VSCode.window.showWarningMessage(`"Bind all workspace folders to SonarQube or SonarCloud"
      can only be invoked on an open workspace`);
    }
  }

  async autoBindAllFolders(unboundFolders: VSCode.WorkspaceFolder[]) {
    unboundFolders.forEach(unboundFolder => this.autoBindFolder(unboundFolder));
  }

  async checkConditionsAndAttemptAutobinding() {
    if (!this.isConnectionConfigured()) {
      return;
    }
    if (this.workspaceState.get(DO_NOT_ASK_ABOUT_AUTO_BINDING_FOR_WS_FLAG)) {
      return;
    }
    const unboundFolders = VSCode.workspace.workspaceFolders.filter(workspaceFolder =>
      this.bindingService.shouldBeAutoBound(workspaceFolder)
    );
    if (unboundFolders.length > AUTOBINDING_THRESHOLD) {
      const userPermission = await this.askUserBeforeAutoBinding();
      if (userPermission) {
        this.autoBindAllFolders(unboundFolders);
      }
    } else {
      this.autoBindAllFolders(unboundFolders);
    }
  }

  isConnectionConfigured(): boolean {
    const sonarCloudConnections = this.settingsService.getSonarCloudConnections();
    const sonarQubeConnections = this.settingsService.getSonarQubeConnections();
    return sonarCloudConnections.length > 0 || sonarQubeConnections.length > 0;
  }

  async autoBindAllUnboundFolders(unboundFolders) {
    unboundFolders.forEach(unboundFolder => {
      this.autoBindFolder(unboundFolder);
    });
  }

  async autoBindFolder(unboundFolder: VSCode.WorkspaceFolder) {
    const analysisFileDetected = await this.autoDetectAnalysisSettings(unboundFolder);
    if (!analysisFileDetected) {
      this.attemptAutoBindingByMatchingNames(unboundFolder);
    }
  }

  async attemptAutoBindingByMatchingNames(unboundFolder: VSCode.WorkspaceFolder) {
    const sqConnections = this.settingsService.getSonarQubeConnections();
    const scConnections = this.settingsService.getSonarCloudConnections();
    const connectionToServerProjects = await this.bindingService.getConnectionToServerProjects(
      scConnections,
      sqConnections
    );
    const connectionToBestHits = await this.getBestHitsForConnections(connectionToServerProjects, unboundFolder);
    this.promptToAutoBind(connectionToBestHits, unboundFolder);
  }

  async autoDetectAnalysisSettings(unboundFolder: VSCode.WorkspaceFolder) {
    const analysisSettingsFile = await this.getAnalysisSettingsFile(unboundFolder);
    if (analysisSettingsFile) {
      const { serverUrl, projectKey, organization } = await this.parseAnalysisSettings(
        analysisSettingsFile[0],
        unboundFolder
      );
      const existingConnection = organization
        ? this.settingsService.getSonarCloudConnectionForOrganization(organization)
        : this.settingsService.getSonarQubeConnectionForUrl(serverUrl);
      if (!existingConnection) {
        // TODO suggest user to create a connection
        return false;
      }

      if (!(await this.matchingRemoteProjectExists(projectKey, existingConnection))) {
        return false;
      }
      const commonMessage = `Do you want to bind folder ${unboundFolder.name} to project ${projectKey}`;
      const message = organization
        ? `${commonMessage} of SonarCloud organization ${organization}?`
        : `${commonMessage} of SonarQube server ${serverUrl}?`;

      const result = await VSCode.window.showInformationMessage(
        message,
        BIND_ACTION,
        CHOOSE_MANUALLY_ACTION,
        DONT_ASK_AGAIN_ACTION
      );

      switch (result) {
        case BIND_ACTION:
          await this.bindingService.saveBinding(projectKey, existingConnection.connectionId, unboundFolder);
          break;
        case CHOOSE_MANUALLY_ACTION:
          const targetConnection = await this.getTargetConnectionForManualBinding();
          await this.bindingService.createOrEditBinding(targetConnection.connectionId, targetConnection.contextValue);
          break;
        case DONT_ASK_AGAIN_ACTION:
          await this.workspaceState.update(DO_NOT_ASK_ABOUT_AUTO_BINDING_FOR_FOLDER_FLAG, [
            ...this.getFoldersThatShouldNotBeAutoBound(),
            unboundFolder.uri.toString()
          ]);
          break;
        default:
          // NOP
          break;
      }
      return true;
    }
    return false;
  }

  async getAnalysisSettingsFile(unboundFolder: VSCode.WorkspaceFolder) {
    const folderFiles = await VSCode.workspace.fs.readDirectory(unboundFolder.uri);
    return folderFiles.find(([name, type]) => {
      return type === VSCode.FileType.File && ANALYSIS_SETTINGS_FILE_NAMES.includes(name);
    });
  }

  private getFoldersThatShouldNotBeAutoBound(): string[] {
    return this.workspaceState.get<string[]>(DO_NOT_ASK_ABOUT_AUTO_BINDING_FOR_FOLDER_FLAG, []);
  }

  private async matchingRemoteProjectExists(projectKey: string, existingConnection): Promise<boolean> {
    const getRemoteProjectsParam = existingConnection.connectionId
      ? existingConnection.connectionId
      : DEFAULT_CONNECTION_ID;
    const remoteProjects = await this.bindingService.getRemoteProjects(getRemoteProjectsParam);
    return remoteProjects[projectKey] !== undefined;
  }

  private async parseAnalysisSettings(analysisSettingsFileName: string, unboundFolder: VSCode.WorkspaceFolder) {
    const projectPropertiesUri = VSCode.Uri.joinPath(unboundFolder.uri, analysisSettingsFileName);
    const projectPropertiesContents = await VSCode.workspace.fs.readFile(projectPropertiesUri);
    const projectProperties = properties.parse(projectPropertiesContents.toString());
    const serverUrl = projectProperties['sonar.host.url'];
    const projectKey = projectProperties['sonar.projectKey'];
    const organization = projectProperties['sonar.organization'];
    return { serverUrl, projectKey, organization };
  }

  async getTargetConnectionForManualBinding() {
    const sonarQubeConnections = this.settingsService.getSonarQubeConnections();
    const sonarCloudConnections = this.settingsService.getSonarCloudConnections();
    let targetConnection;
    if (sonarCloudConnections.length === 0 && sonarQubeConnections.length === 1) {
      targetConnection = {
        label: this.computeItemLabel('SonarQube', sonarQubeConnections[0]),
        description: 'SonarQube',
        connectionId: this.computeConnectionId(sonarQubeConnections[0]),
        contextValue: 'sonarqubeConnection'
      };
    } else if (sonarQubeConnections.length === 0 && sonarCloudConnections.length === 1) {
      targetConnection = {
        label: this.computeItemLabel('SonarCloud', sonarCloudConnections[0]),
        description: 'SonarCloud',
        connectionId: this.computeConnectionId(sonarCloudConnections[0]),
        contextValue: 'sonarcloudConnection'
      };
    } else {
      const connectionNames = [];
      sonarQubeConnections.forEach(c => {
        connectionNames.push({
          label: this.computeItemLabel('SonarQube', c),
          description: 'SonarQube',
          connectionId: this.computeConnectionId(c),
          contextValue: 'sonarqubeConnection'
        });
      });
      sonarCloudConnections.forEach(c => {
        connectionNames.push({
          label: this.computeItemLabel('SonarCloud', c),
          description: 'SonarCloud',
          connectionId: this.computeConnectionId(c),
          contextValue: 'sonarcloudConnection'
        });
      });
      targetConnection = VSCode.window.showQuickPick(connectionNames, {
        title: 'Select Connection to Create Binding for',
        placeHolder: 'For which connection do you want to create project binding?'
      });
    }
    return targetConnection;
  }

  private computeItemLabel(serverType: 'SonarQube' | 'SonarCloud', connection) {
    if (serverType === 'SonarQube') {
      return connection.connectionId ? connection.connectionId : connection.serverUrl;
    }
    return connection.connectionId ? connection.connectionId : connection.organizationKey;
  }

  private computeConnectionId(connection) {
    return connection.connectionId ? connection.connectionId : DEFAULT_CONNECTION_ID;
  }

  async askUserBeforeAutoBinding() {
    return VSCode.window
      .showInformationMessage(
        `We found folders in your workspace that are not bound to any SonarQube/SonarCloud projects.
       Do you want to attempt binding automatically?
       [Learn More](https://github.com/SonarSource/sonarlint-vscode/wiki/Connected-Mode#project-binding)`,
        ATTEMPT_AUTOBINDING_ACTION,
        CHOOSE_MANUALLY_ACTION,
        DONT_ASK_AGAIN_ACTION
      )
      .then(async action => {
        if (action === DONT_ASK_AGAIN_ACTION) {
          this.workspaceState.update(DO_NOT_ASK_ABOUT_AUTO_BINDING_FOR_WS_FLAG, true);
          return false;
        } else if (action === CHOOSE_MANUALLY_ACTION) {
          const targetConnection = await this.getTargetConnectionForManualBinding();
          this.bindingService.createOrEditBinding(targetConnection.connectionId, targetConnection.contextValue);
          return false;
        } else if (action === ATTEMPT_AUTOBINDING_ACTION) {
          return true;
        }
        return false;
      });
  }

  private async getBestHitsForConnections(
    connectionToServerProjects: Map<BaseConnection, ServerProject[]>,
    unboundFolder: VSCode.WorkspaceFolder
  ): Promise<Map<BaseConnection, MatchHit[]>> {
    const folderName = unboundFolder.name;
    const workspaceName = VSCode.workspace.name;
    const folderNameTokens = [...tokenizeString(folderName)];
    const workspaceNameTokens = [...tokenizeString(workspaceName)];
    const connectionToBestHits = new Map<BaseConnection, MatchHit[]>();
    for (const [connection, projects] of connectionToServerProjects) {
      let bestHits: MatchHit[] = [];
      bestHits.push({ hits: 0, projectKey: '', connection: { connectionId: '' } });
      for (const project of projects) {
        const projectKey = project.key;
        const projectName = project.name;
        const serverProjectString = (projectKey + projectName).toLowerCase();
        const folderNameHits = this.getHits(folderNameTokens, serverProjectString);
        const workspaceNameHits = this.getHits(workspaceNameTokens, serverProjectString);
        const bestHitCount = bestHits[0].hits;
        if (folderNameHits >= bestHitCount || workspaceNameHits >= bestHitCount) {
          bestHits = this.updateBestHits(bestHits, folderNameHits, workspaceNameHits, projectKey, connection);
        }
      }
      if (bestHits[0].hits > 0) {
        connectionToBestHits.set(connection, bestHits);
      }
    }
    return connectionToBestHits;
  }

  private async promptToAutoBind(
    connectionToBestHits: Map<BaseConnection, MatchHit[]>,
    unboundFolder: VSCode.WorkspaceFolder
  ) {
    const [bestHits] = connectionToBestHits.values();
    if (connectionToBestHits.size === 1 && bestHits.length === 1) {
      const bestHit = bestHits[0];
      this.promptToAutoBindSingleOption(bestHit, connectionToBestHits, unboundFolder);
    } else if (bestHits.length > 1) {
      this.promptToAutoBindMultiChoice(connectionToBestHits, unboundFolder);
    } else {
      this.promptToBindManually(unboundFolder);
    }
  }

  private async promptToBindManually(unboundFolder: VSCode.WorkspaceFolder) {
    VSCode.window
      .showInformationMessage(
        `We found folders in your workspace that are not bound to any SonarQube/SonarCloud projects. Do you want to configure bindings?
       [Learn More](https://github.com/SonarSource/sonarlint-vscode/wiki/Connected-Mode#project-binding)`,
        BIND_ACTION,
        DONT_ASK_AGAIN_ACTION
      )
      .then(async action => {
        if (action === DONT_ASK_AGAIN_ACTION) {
          this.workspaceState.update(DO_NOT_ASK_ABOUT_AUTO_BINDING_FOR_FOLDER_FLAG, [
            ...this.getFoldersThatShouldNotBeAutoBound(),
            unboundFolder.uri.toString()
          ]);
        } else if (action === BIND_ACTION) {
          const targetConnection = await this.getTargetConnectionForManualBinding();
          this.bindingService.createOrEditBinding(targetConnection.connectionId, targetConnection.contextValue);
        }
      });
  }

  private async promptToAutoBindSingleOption(
    bestHit: MatchHit,
    connectionToBestHits: Map<BaseConnection, MatchHit[]>,
    unboundFolder: VSCode.WorkspaceFolder
  ) {
    const [connection] = connectionToBestHits.keys();
    const connectionName = getDisplayName(connection);
    const result = await VSCode.window.showInformationMessage(
      `There is a project ${bestHit.projectKey} on ${connectionName}. Do you want to configure binding?
      [Learn More](https://github.com/SonarSource/sonarlint-vscode/wiki/Connected-Mode#project-binding)`,
      BIND_ACTION,
      CHOOSE_MANUALLY_ACTION,
      DONT_ASK_AGAIN_ACTION
    );
    switch (result) {
      case BIND_ACTION:
        await this.bindingService.saveBinding(bestHit.projectKey, connection.connectionId, unboundFolder);
        break;
      case CHOOSE_MANUALLY_ACTION:
        const targetConnection = await this.getTargetConnectionForManualBinding();
        await this.bindingService.createOrEditBinding(targetConnection.connectionId, targetConnection.contextValue);
        break;
      case DONT_ASK_AGAIN_ACTION:
        await this.workspaceState.update(DO_NOT_ASK_ABOUT_AUTO_BINDING_FOR_FOLDER_FLAG, [
          ...this.getFoldersThatShouldNotBeAutoBound(),
          unboundFolder.uri.toString()
        ]);
        break;
      default:
        // NOP
        break;
    }
  }

  private async promptToAutoBindMultiChoice(
    connectionToBestHits: Map<BaseConnection, MatchHit[]>,
    unboundFolder: VSCode.WorkspaceFolder
  ) {
    const result = await VSCode.window.showInformationMessage(
      `There are multiple projects on Sonar server(s) that match your local workspace. Do you want to configure binding?
      [Learn More](https://github.com/SonarSource/sonarlint-vscode/wiki/Connected-Mode#project-binding)`,
      BIND_ACTION,
      DONT_ASK_AGAIN_ACTION
    );
    switch (result) {
      case BIND_ACTION:
        this.showQuickPickListOfProjects(unboundFolder, connectionToBestHits);
        break;
      case DONT_ASK_AGAIN_ACTION:
        await this.workspaceState.update(DO_NOT_ASK_ABOUT_AUTO_BINDING_FOR_FOLDER_FLAG, [
          ...this.getFoldersThatShouldNotBeAutoBound(),
          unboundFolder.uri.toString()
        ]);
        break;
      default:
        // NOP
        break;
    }
  }

  showQuickPickListOfProjects(
    unboundFolder: VSCode.WorkspaceFolder,
    connectionToBestHits: Map<BaseConnection, MatchHit[]>
  ) {
    const remoteProjectsQuickPick = VSCode.window.createQuickPick();
    const folderName = unboundFolder.name;
    remoteProjectsQuickPick.title = `Select Project to Bind with '${folderName}/'`;
    remoteProjectsQuickPick.placeholder = `Select the remote project you want to bind with '${folderName}/' folder`;
    remoteProjectsQuickPick.items = this.getQuickPickItemsToAutoBind(connectionToBestHits);
    remoteProjectsQuickPick.ignoreFocusOut = true;
    remoteProjectsQuickPick.onDidChangeSelection(selection => {
      const projectToBind = selection[0] as AutoBindProjectQuickPickItem;
      this.bindingService.saveBinding(projectToBind.description, projectToBind.connectionId, unboundFolder);
      VSCode.window.showInformationMessage(`Workspace folder '${folderName}/' has been bound with 
      project '${projectToBind.description} on ${projectToBind.connectionId} server'`);
      remoteProjectsQuickPick.dispose();
    });
    remoteProjectsQuickPick.onDidTriggerItemButton(async e => {
      const [connectionId, projectKey] = e.item.label.split(' - ');
      const connection = Array.from(connectionToBestHits.keys()).find(c => c.connectionId === connectionId);
      const serverType = getServerType(connection);
      const baseServerUrl = this.bindingService.getBaseServerUrl(connection.connectionId, serverType);
      remoteProjectsQuickPick.busy = true;
      VSCode.commands.executeCommand(Commands.OPEN_BROWSER, VSCode.Uri.parse(`${baseServerUrl}?id=${projectKey}`));
    });
    remoteProjectsQuickPick.show();
  }

  private getQuickPickItemsToAutoBind(connectionToBestHits: Map<BaseConnection, MatchHit[]>) {
    const itemsList: VSCode.QuickPickItem[] = [];
    for (const [connection, hits] of connectionToBestHits) {
      const connectionServerType = getServerType(connection);
      const connectionDisplayName = getDisplayName(connection);
      itemsList.push({ label: connectionDisplayName, kind: QuickPickItemKind.Separator });
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

  private getHits(localTokens: string[], serverProjectString: string): number {
    let hits = 0;
    for (const localToken of localTokens) {
      if (serverProjectString.includes(localToken)) {
        hits++;
      }
    }
    return hits;
  }

  private updateBestHits(
    bestHits: MatchHit[],
    folderNameHits: number,
    workspaceNameHits: number,
    projectKey: string,
    connection: BaseConnection
  ) {
    const previousHitCount = bestHits[0].hits;
    const newHitCount = folderNameHits > workspaceNameHits ? folderNameHits : workspaceNameHits;
    return this.updateHits(newHitCount, previousHitCount, bestHits, projectKey, connection);
  }

  private updateHits(
    hits: number,
    bestHitCount: number,
    bestHits: MatchHit[],
    projectKey: string,
    connection: BaseConnection
  ) {
    const bestHit = {
      hits,
      projectKey,
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
}

export interface MatchHit {
  hits: number;
  projectKey: string;
  connection: BaseConnection;
}

interface AutoBindProjectQuickPickItem extends QuickPickItem {
  connectionId?: string;
}
