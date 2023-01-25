/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

'use strict';

import * as VSCode from 'vscode';
import * as properties from 'properties';
import { BindingService } from './binding';
import { BaseConnection, ConnectionSettingsService } from '../settings/connectionsettings';
import {
  getServerType,
  getBestHitsForConnections,
  MatchHit,
  getServerUrlOrOrganizationKey
} from '../util/bindingUtils';

const AUTOBINDING_THRESHOLD = 5;
const BIND_ACTION = 'Configure Binding';
const CHOOSE_MANUALLY_ACTION = 'Choose Manually';
const DONT_ASK_AGAIN_ACTION = "Don't Ask Again";
export const DO_NOT_ASK_ABOUT_AUTO_BINDING_FOR_WS_FLAG = 'doNotAskAboutAutoBindingForWorkspace';
export const DO_NOT_ASK_ABOUT_AUTO_BINDING_FOR_FOLDER_FLAG = 'doNotAskAboutAutoBindingForFolder';
const DEFAULT_CONNECTION_ID = '<default>';
const LEARN_MORE_DOCS_LINK = 'https://github.com/SonarSource/sonarlint-vscode/wiki/Connected-Mode';

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
  ) {}

  static get instance(): AutoBindingService {
    return AutoBindingService._instance;
  }

  async autoBindWorkspace() {
    if (VSCode.workspace.workspaceFolders && this.isConnectionConfigured()) {
      const unboundFolders = VSCode.workspace.workspaceFolders.filter(
        workspaceFolder => !this.bindingService.isBound(workspaceFolder)
      );
      if (unboundFolders.length > 0) {
        this.autoBindAllFolders(unboundFolders);
      } else {
        VSCode.window.showInformationMessage(`All folders in this workspace are already bound
         to SonarQube or SonarCloud projects`);
      }
    } else if (!this.isConnectionConfigured()) {
      VSCode.window
        .showWarningMessage(
          `"Bind all workspace folders to SonarQube or SonarCloud"
      can only be invoked if a SonarQube or SonarCloud connection exists`);
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
    const connectionToBestHits = getBestHitsForConnections(connectionToServerProjects, unboundFolder);
    if (connectionToBestHits.size > 0) {
      // We don't want to show notification if it is not actionable
      this.promptToAutoBind(connectionToBestHits, unboundFolder);
    }
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
        return false;
      }

      if (!(await this.matchingRemoteProjectExists(projectKey, existingConnection))) {
        return false;
      }
      const commonMessage = `Do you want to bind folder '${unboundFolder.name}' to project '${projectKey}'`;
      const message = organization
        ? `${commonMessage} of SonarCloud organization '${organization}'?
        [Learn More](${LEARN_MORE_DOCS_LINK})`
        : `${commonMessage} of SonarQube server '${serverUrl}'?
        [Learn More](${LEARN_MORE_DOCS_LINK})`;

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
        `There are folders in your workspace that are not bound to any SonarQube/SonarCloud projects.
       Do you want to configure binding?
       [Learn More](${LEARN_MORE_DOCS_LINK})`,
        BIND_ACTION,
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
        } else if (action === BIND_ACTION) {
          return true;
        }
        return false;
      });
  }

  private async promptToAutoBind(
    connectionToBestHits: Map<BaseConnection, MatchHit[]>,
    unboundFolder: VSCode.WorkspaceFolder
  ) {
    const allHitsArray = Array.from(connectionToBestHits.values());
    const allHitsFlat = [].concat.apply([], allHitsArray);
    if (connectionToBestHits.size === 1 && allHitsFlat.length === 1) {
      const bestHit = allHitsFlat[0];
      this.promptToAutoBindSingleOption(bestHit, connectionToBestHits, unboundFolder);
    } else if (allHitsFlat.length > 1) {
      this.promptToAutoBindMultiChoice(unboundFolder);
    } else {
      this.promptToBindManually(unboundFolder);
    }
  }

  private async promptToBindManually(unboundFolder: VSCode.WorkspaceFolder) {
    VSCode.window
      .showInformationMessage(
        `There are folders in your workspace that are not bound to any SonarQube/SonarCloud projects.
        Do you want to configure binding?
       [Learn More](${LEARN_MORE_DOCS_LINK})`,
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
    const serverUrlOrOrganizationKey = getServerUrlOrOrganizationKey(connection);
    const serverType = getServerType(connection);

    const commonMessage = `Do you want to bind folder '${unboundFolder.name}' to project '${bestHit.projectKey}'`;
    const message =
      serverType === 'SonarQube'
        ? `${commonMessage} of SonarQube server '${serverUrlOrOrganizationKey}'?`
        : `${commonMessage} of SonarCloud organization '${serverUrlOrOrganizationKey}'?`;

    const result = await VSCode.window.showInformationMessage(
      `${message}
      [Learn More](${LEARN_MORE_DOCS_LINK})`,
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

  private async promptToAutoBindMultiChoice(unboundFolder: VSCode.WorkspaceFolder) {
    const result = await VSCode.window.showInformationMessage(
      `There are folders in your workspace that are not bound to any SonarQube/SonarCloud projects.
      Do you want to configure binding?
      [Learn More](${LEARN_MORE_DOCS_LINK})`,
      BIND_ACTION,
      DONT_ASK_AGAIN_ACTION
    );
    switch (result) {
      case BIND_ACTION:
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
}
