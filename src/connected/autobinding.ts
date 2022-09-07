/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

'use strict';

import * as VSCode from 'vscode';
import { BindingService } from './binding';
import { ConnectionSettingsService } from '../settings/connectionsettings';

const AUTOBINDING_THRESHOLD = 5;
const ATTEMPT_AUTOBINDING_ACTION = 'Attempt Auto-binding';
const CHOOSE_MANUALLY_ACTION = 'Choose Manually';
const DONT_ASK_AGAIN_ACTION = "Don't ask again";
export const DO_NOT_ASK_ABOUT_AUTO_BINDING_FLAG = 'doNotAskAboutAutoBinding';
const DEFAULT_CONNECTION_ID = '<default>';

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

  async checkConditionsAndAttemptAutobinding() {
    if (!this.isConnectionConfigured()) {
      return;
    }
    if (this.workspaceState.get(DO_NOT_ASK_ABOUT_AUTO_BINDING_FLAG)) {
      return;
    }
    const unboundFolders = VSCode.workspace.workspaceFolders.filter(workspaceFolder =>
      this.bindingService.shouldBeAutoBound(workspaceFolder)
    );
    if (unboundFolders.length > AUTOBINDING_THRESHOLD) {
      const userPermission = await this.askUserBeforeAutoBinding();
      if (userPermission) {
        this.autoBindAllUnboundFolders(unboundFolders);
      }
    } else {
      this.autoBindAllUnboundFolders(unboundFolders);
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
    console.log(`attempting auto-binding for ${unboundFolder.name}`);
    // TODO [SLVSCODE-326] detect file config and suggest binding
    // TODO [SLVSCODE-328] match by name and suggest binding
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
          this.workspaceState.update(DO_NOT_ASK_ABOUT_AUTO_BINDING_FLAG, true);
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
}
