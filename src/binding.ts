/* --------------------------------------------------------------------------------------------
* SonarLint for VisualStudio Code
* Copyright (C) 2017-2022 SonarSource SA
* sonarlint@sonarsource.com
* Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
* ------------------------------------------------------------------------------------------ */

'use strict';

import * as VSCode from 'vscode';
import { Commands } from './commands';
import { ConnectionSettingsService } from './settings';
import { SonarLintExtendedLanguageClient } from './client';

const SONARLINT_CATEGORY = 'sonarlint';
const BINDING_SETTINGS = 'connectedMode.project';
const DEFAULT_CONNECTION_ID = '<default>';
const OPEN_FOLDER_ACTION = 'Open Folder';
const BIND_MANUALLY_ACTION = 'Bind Manually';

export interface ProjectBinding {
  connectionId?: string;
  serverId?: string;
  projectKey: string;
  workspaceFolder: VSCode.WorkspaceFolder;
}

async function bindManuallyAction(workspaceFolder: VSCode.WorkspaceFolder) {
  const existingSettings = VSCode.workspace.getConfiguration(SONARLINT_CATEGORY, workspaceFolder)
    .get<ProjectBinding>(BINDING_SETTINGS);
  if (existingSettings.projectKey === undefined) {
    await VSCode.workspace.getConfiguration(SONARLINT_CATEGORY, workspaceFolder)
      .update(BINDING_SETTINGS, { connectionId: '', projectKey: '' });
  }
  VSCode.commands.executeCommand('workbench.action.openFolderSettingsFile');
}

export class BindingService {

  private static _instance: BindingService;

  static init(languageClient: SonarLintExtendedLanguageClient,
              settingsService: ConnectionSettingsService): void {
    BindingService._instance = new BindingService(languageClient, settingsService);
  }

  constructor(
    private readonly languageClient: SonarLintExtendedLanguageClient,
    private readonly settingsService: ConnectionSettingsService
  ) {
  }

  static get instance(): BindingService {
    return BindingService._instance;
  }

  getAllBindings(): Map<string, Map<string, BoundFolder[]>> {
    const bindings = new Map();
    for (const folder of VSCode.workspace.workspaceFolders || []) {
      const config = VSCode.workspace.getConfiguration(SONARLINT_CATEGORY, folder.uri);
      const binding = config.get<ProjectBinding>(BINDING_SETTINGS);
      const projectKey = binding.projectKey;
      if (projectKey) {
        const connectionId = binding.connectionId || binding.serverId || '<default>';
        let connectionBindings = bindings.get(connectionId);
        if (!bindings.has(connectionId)) {
          bindings.set(connectionId, new Map());
        }
        connectionBindings = bindings.get(connectionId);
        if (!connectionBindings.has(projectKey)) {
          connectionBindings.set(projectKey, []);
        }
        connectionBindings.get(projectKey).push({ folder, binding });
      }
    }
    return bindings;
  }

  async createOrUpdateBinding(connectionId: string, contextValue: string) {
    const workspaceFolders = VSCode.workspace.workspaceFolders;
    const serverType = contextValue === 'sonarqubeConnection' ? 'SonarQube' : 'SonarCloud';
    const serverUrlOrOrganizationKey = serverType === 'SonarQube' ?
      (await this.settingsService.loadSonarQubeConnection(connectionId)).serverUrl :
      (await this.settingsService.loadSonarCloudConnection(connectionId)).organizationKey;
    const baseServerUrl =
      serverType === 'SonarQube' ?
        `${serverUrlOrOrganizationKey}/dashboard` : 'https://sonarcloud.io/project/overview';
    let selectedRemoteProject;

    if (workspaceFolders) {
      this.showFolderSelectionQuickPickOrReturnDefaultSelection(workspaceFolders)
        .then(async (selectedFolderName) => {
          const workspaceFolder = workspaceFolders.find(f => f.name === selectedFolderName);
          const remoteProjects = await this.getRemoteProjectsItems(connectionId, workspaceFolder, serverType);

          if (remoteProjects) {
            const remoteProjectsQuickPick = VSCode.window.createQuickPick();
            remoteProjectsQuickPick.title =
              `Select ${serverType} Project to Bind with '${selectedFolderName}/'`;
            remoteProjectsQuickPick.placeholder =
              `Select the remote project you want to bind with '${selectedFolderName}/' folder`;
            remoteProjectsQuickPick.items = remoteProjects;
            remoteProjectsQuickPick.ignoreFocusOut = true;

            remoteProjectsQuickPick.onDidTriggerItemButton(e => {
              remoteProjectsQuickPick.busy = true;
              VSCode.commands.executeCommand(Commands.OPEN_BROWSER,
                VSCode.Uri.parse(`${baseServerUrl}?id=${e.item.description}`));
              console.log('button clicked');
            });

            remoteProjectsQuickPick.onDidChangeSelection(selection => {
              selectedRemoteProject = selection[0];
              console.log('selection made');
              this.saveBinding(selectedRemoteProject.description, connectionId, workspaceFolder);
              VSCode.window.showInformationMessage(`Workspace folder '${selectedFolderName}/'
                has been bound with ${serverType} project '${selectedRemoteProject.label}'`);
              remoteProjectsQuickPick.dispose();
            });

            remoteProjectsQuickPick.show();
          }
        });
    } else {
      VSCode.window.showWarningMessage('No folder to bind, please open a workspace or folder first',
        OPEN_FOLDER_ACTION)
        .then(action => {
          if (action === OPEN_FOLDER_ACTION) {
            VSCode.commands.executeCommand('vscode.openFolder');
          }
        });
    }
  }

  async updateBinding(workspaceFolderUri: VSCode.Uri, projectBinding: ProjectBinding): Promise<void> {
    const config = VSCode.workspace.getConfiguration(SONARLINT_CATEGORY, workspaceFolderUri);
    return config.update(BINDING_SETTINGS, projectBinding, VSCode.ConfigurationTarget.WorkspaceFolder);
  }

  async deleteBinding(workspaceFolderUri: VSCode.Uri): Promise<void> {
    const config = VSCode.workspace.getConfiguration(SONARLINT_CATEGORY, workspaceFolderUri);
    return config.update(BINDING_SETTINGS, undefined, VSCode.ConfigurationTarget.WorkspaceFolder);
  }

  async showFolderSelectionQuickPickOrReturnDefaultSelection(workspaceFolders: readonly VSCode.WorkspaceFolder[]) {
    return workspaceFolders.length === 1 ? workspaceFolders[0].name :
      VSCode.window.showQuickPick(workspaceFolders.map(f => f.name),
        {
          title: 'Select Folder to Bind',
          placeHolder: 'Select the workspace folder you want to create binding for'
        });
  }

  async saveBinding(projectKey: string, connectionId?: string, workspaceFolder?: VSCode.WorkspaceFolder) {
    VSCode.workspace.getConfiguration(SONARLINT_CATEGORY, workspaceFolder)
      .update(BINDING_SETTINGS, { connectionId, projectKey });
  }

  async getRemoteProjectsItems(connectionId: string,
                               workspaceFolder: VSCode.WorkspaceFolder,
                               serverType: 'SonarQube' | 'SonarCloud') {
    const getRemoteProjectsParam = connectionId ? connectionId : DEFAULT_CONNECTION_ID;
    const itemsList = [];

    try {
      let remoteProjects = await this.languageClient.getRemoteProjectsForConnection(getRemoteProjectsParam);
      if (!(remoteProjects instanceof Map)) {
        remoteProjects = new Map(Object.entries(remoteProjects));
      }

      if (remoteProjects.size === 0) {
        VSCode.window.showWarningMessage('No remote projects to display.', BIND_MANUALLY_ACTION)
          .then(async (action) => {
            if (action === BIND_MANUALLY_ACTION) {
              bindManuallyAction(workspaceFolder);
            }
          });
      }

      remoteProjects.forEach((v, k) => {
        itemsList.push({
          label: v,
          description: k,
          buttons: [
            {
              iconPath: new VSCode.ThemeIcon('link-external'),
              tooltip: `View in ${serverType}`
            }]
        });
      });
    } catch {
      VSCode.window.showErrorMessage('Request Failed: Could not get the list of remote projects.' +
        ' Please check the connection.');
    }

    return itemsList;
  }
}

export interface ProjectBinding {
  projectKey: string;
  serverId?: string;
  connectionId?: string;
}

export interface BoundFolder {
  folder: VSCode.WorkspaceFolder;
  binding: ProjectBinding;
}
