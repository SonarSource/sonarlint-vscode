/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

'use strict';

import * as VSCode from 'vscode';
import { Memento } from 'vscode';
import { Commands } from '../util/commands';
import { ConnectionSettingsService } from '../settings/connectionsettings';
import { SonarLintExtendedLanguageClient } from '../lsp/client';
import { Connection, ServerType, WorkspaceFolderItem } from './connections';
import { buildBaseServerUrl, serverProjectsToQuickPickItems } from '../util/bindingUtils';
import { code2ProtocolConverter } from '../util/uri';
import { DEFAULT_CONNECTION_ID } from '../commons';
import { AssistBindingParams, ShowSoonUnsupportedVersionMessageParams } from '../lsp/protocol';
import { DONT_ASK_AGAIN_ACTION } from '../util/showMessage';

const SONARLINT_CATEGORY = 'sonarlint';
const BINDING_SETTINGS = 'connectedMode.project';
const OPEN_FOLDER_ACTION = 'Open Folder';
const BIND_MANUALLY_ACTION = 'Bind Manually';
export const DO_NOT_ASK_ABOUT_AUTO_BINDING_FOR_FOLDER_FLAG = 'doNotAskAboutAutoBindingForFolder';

async function bindManuallyAction(workspaceFolder: VSCode.WorkspaceFolder) {
  const existingSettings = VSCode.workspace
    .getConfiguration(SONARLINT_CATEGORY, workspaceFolder)
    .get<ProjectBinding>(BINDING_SETTINGS);
  if (existingSettings.projectKey === undefined) {
    await VSCode.workspace
      .getConfiguration(SONARLINT_CATEGORY, workspaceFolder)
      .update(BINDING_SETTINGS, { connectionId: '', projectKey: '' });
  }
  VSCode.commands.executeCommand('workbench.action.openFolderSettingsFile');
}

export class BindingService {
  private static _instance: BindingService;

  static init(
    languageClient: SonarLintExtendedLanguageClient,
    workspaceState: VSCode.Memento,
    settingsService: ConnectionSettingsService
  ): void {
    BindingService._instance = new BindingService(languageClient, workspaceState, settingsService);
  }

  constructor(
    private readonly languageClient: SonarLintExtendedLanguageClient,
    private readonly workspaceState: VSCode.Memento,
    private readonly settingsService: ConnectionSettingsService
  ) {}

  static get instance(): BindingService {
    return BindingService._instance;
  }

  async deleteBindingWithConfirmation(binding: WorkspaceFolderItem): Promise<void> {
    const deleteAction = 'Delete';
    const confirm = await VSCode.window.showWarningMessage(
      `Are you sure you want to delete ${binding.serverType} project binding '${binding.name}'?`,
      { modal: true },
      deleteAction
    );
    if (confirm !== deleteAction) {
      return Promise.resolve(undefined);
    }
    return this.deleteBinding(binding);
  }

  async deleteBinding(workspaceFolderItem: WorkspaceFolderItem | BoundFolder): Promise<void> {
    const folder =
      workspaceFolderItem instanceof WorkspaceFolderItem ? workspaceFolderItem.uri : workspaceFolderItem.folder;
    const config = VSCode.workspace.getConfiguration(SONARLINT_CATEGORY, folder);
    return config.update(BINDING_SETTINGS, undefined, VSCode.ConfigurationTarget.WorkspaceFolder);
  }

  async deleteBindingsForConnection(connection: Connection) {
    const connectionId = connection.id || DEFAULT_CONNECTION_ID;
    const allBindings = this.getAllBindings();
    const bindingsForConnection: Map<string, BoundFolder[]> = allBindings.get(connectionId);
    if (bindingsForConnection) {
      for (const folders of bindingsForConnection.values()) {
        await Promise.all(folders.map(f => this.deleteBinding(f)));
      }
    }
  }

  getAllBindings(): Map<string, Map<string, BoundFolder[]>> {
    const bindingsPerConnectionId = new Map<string, Map<string, BoundFolder[]>>();
    for (const folder of VSCode.workspace.workspaceFolders || []) {
      const config = VSCode.workspace.getConfiguration(SONARLINT_CATEGORY, folder.uri);
      const binding = config.get<ProjectBinding>(BINDING_SETTINGS);
      const projectKey = binding.projectKey;
      if (projectKey) {
        const connectionId = binding.connectionId || binding.serverId || DEFAULT_CONNECTION_ID;
        if (!bindingsPerConnectionId.has(connectionId)) {
          bindingsPerConnectionId.set(connectionId, new Map<string, BoundFolder[]>());
        }
        const connectionBindingsPerProjectKey = bindingsPerConnectionId.get(connectionId);
        if (!connectionBindingsPerProjectKey.has(projectKey)) {
          connectionBindingsPerProjectKey.set(projectKey, []);
        }
        connectionBindingsPerProjectKey.get(projectKey).push({ folder, binding });
      }
    }
    return bindingsPerConnectionId;
  }

  async assistBinding(params: AssistBindingParams) {
    const workspaceFolders = VSCode.workspace.workspaceFolders;
    const selectedWorkspaceFolderName = await this.showFolderSelectionQuickPickOrReturnDefaultSelection(
      workspaceFolders
    );
    const workspaceFolder = workspaceFolders.find(f => f.name === selectedWorkspaceFolderName);

    const existingSettings = VSCode.workspace
      .getConfiguration(SONARLINT_CATEGORY, workspaceFolder)
      .get<ProjectBinding>(BINDING_SETTINGS);
    if (existingSettings.projectKey === undefined) {
      await VSCode.workspace
        .getConfiguration(SONARLINT_CATEGORY, workspaceFolder)
        .update(BINDING_SETTINGS, { connectionId: params.connectionId, projectKey: params.projectKey });
    }
    VSCode.commands.executeCommand('workbench.action.openFolderSettingsFile');
  }

  async createOrEditBinding(
    connectionId: string,
    contextValue: string,
    workspaceFolder?: VSCode.WorkspaceFolder,
    serverType?: ServerType
  ) {
    const workspaceFolders = VSCode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      const action = await VSCode.window.showWarningMessage(
        'No folder to bind, please open a workspace or folder first',
        OPEN_FOLDER_ACTION
      );
      if (action === OPEN_FOLDER_ACTION) {
        VSCode.commands.executeCommand('vscode.openFolder');
      }
      return;
    }

    if (!serverType) {
      serverType = contextValue === 'sonarqubeConnection' ? 'SonarQube' : 'SonarCloud';
    }
    let selectedFolderName;
    if (workspaceFolder) {
      selectedFolderName = workspaceFolder.name;
    } else {
      selectedFolderName = await this.showFolderSelectionQuickPickOrReturnDefaultSelection(workspaceFolders);
      workspaceFolder = workspaceFolders.find(f => f.name === selectedFolderName);
    }
    await this.pickRemoteProjectToBind(connectionId, workspaceFolder, serverType, selectedFolderName);
  }

  async getBaseServerUrl(connectionId: string, serverType: ServerType): Promise<string> {
    const serverUrlOrOrganizationKey =
      serverType === 'SonarQube'
        ? (await this.settingsService.loadSonarQubeConnection(connectionId)).serverUrl
        : (await this.settingsService.loadSonarCloudConnection(connectionId)).organizationKey;
    return buildBaseServerUrl(serverType, serverUrlOrOrganizationKey);
  }

  private async pickRemoteProjectToBind(
    connectionId: string,
    workspaceFolder: VSCode.WorkspaceFolder,
    serverType: ServerType,
    selectedFolderName
  ) {
    const baseServerUrl = await this.getBaseServerUrl(connectionId, serverType);
    let selectedRemoteProject;
    const suggestedProjects = await this.getSuggestedItems(connectionId, workspaceFolder, serverType);
    const remoteProjects = await this.getRemoteProjectsItems(connectionId, workspaceFolder, serverType);
    const remoteProjectsItems = this.deduplicateQuickPickItems(suggestedProjects, remoteProjects);
    const allProjectsGroup = { label: 'All Projects', kind: VSCode.QuickPickItemKind.Separator };
    const suggestedProjectsGroup = { label: 'Suggested Projects', kind: VSCode.QuickPickItemKind.Separator };
    if (remoteProjects) {
      const remoteProjectsQuickPick = VSCode.window.createQuickPick();
      remoteProjectsQuickPick.title = `Select ${serverType} Project to Bind with '${selectedFolderName}/'`;
      remoteProjectsQuickPick.placeholder = `Select the remote project you want to bind with '${selectedFolderName}/' folder`;
      remoteProjectsQuickPick.items = [
        suggestedProjectsGroup,
        ...suggestedProjects,
        allProjectsGroup,
        ...remoteProjectsItems
      ];
      remoteProjectsQuickPick.ignoreFocusOut = true;

      remoteProjectsQuickPick.onDidTriggerItemButton(e => {
        remoteProjectsQuickPick.busy = true;
        VSCode.commands.executeCommand(
          Commands.OPEN_BROWSER,
          VSCode.Uri.parse(`${baseServerUrl}?id=${e.item.description}`)
        );
      });

      remoteProjectsQuickPick.onDidChangeSelection(selection => {
        selectedRemoteProject = selection[0];

        this.saveBinding(selectedRemoteProject.description, connectionId, workspaceFolder);
        remoteProjectsQuickPick.dispose();
      });

      remoteProjectsQuickPick.show();
    }
  }

  private deduplicateQuickPickItems(suggestedProjects: VSCode.QuickPickItem[], remoteProjects: VSCode.QuickPickItem[]) {
    suggestedProjects.forEach(sp => {
      remoteProjects = remoteProjects.filter(rp => rp.description !== sp.description);
    });
    return remoteProjects;
  }

  private async getSuggestedItems(
    connectionId: string,
    workspaceFolder: VSCode.WorkspaceFolder,
    serverType: ServerType
  ): Promise<VSCode.QuickPickItem[]> {
    const configScopeId = code2ProtocolConverter(workspaceFolder.uri);
    connectionId = connectionId || DEFAULT_CONNECTION_ID;
    const suggestedBinding = await this.languageClient.getSuggestedBinding(configScopeId, connectionId);

    if (suggestedBinding?.suggestions?.[configScopeId]) {
      return serverProjectsToQuickPickItems(suggestedBinding.suggestions[configScopeId], serverType);
    }
    return [];
  }

  async showFolderSelectionQuickPickOrReturnDefaultSelection(workspaceFolders: readonly VSCode.WorkspaceFolder[]) {
    return workspaceFolders.length === 1
      ? workspaceFolders[0].name
      : VSCode.window.showQuickPick(
          workspaceFolders.map(f => f.name),
          {
            title: 'Select Folder to Bind',
            placeHolder: 'Select the workspace folder you want to create binding for'
          }
        );
  }

  async saveBinding(projectKey: string, connectionId?: string, workspaceFolder?: VSCode.WorkspaceFolder) {
    VSCode.window.showInformationMessage(`Workspace folder '${workspaceFolder.name}/'
                      has been bound with project '${projectKey}'`);
    connectionId = connectionId || DEFAULT_CONNECTION_ID;
    return VSCode.workspace
      .getConfiguration(SONARLINT_CATEGORY, workspaceFolder)
      .update(BINDING_SETTINGS, { connectionId, projectKey });
  }

  async getRemoteProjects(connectionId: string) {
    return this.languageClient.getRemoteProjectsForConnection(connectionId);
  }

  async getRemoteProjectsItems(connectionId: string, workspaceFolder: VSCode.WorkspaceFolder, serverType: ServerType) {
    const getRemoteProjectsParam = connectionId ? connectionId : DEFAULT_CONNECTION_ID;
    const itemsList: VSCode.QuickPickItem[] = [];

    try {
      let remoteProjects = await this.getRemoteProjects(getRemoteProjectsParam);
      if (!(remoteProjects instanceof Map)) {
        remoteProjects = new Map(Object.entries(remoteProjects));
      }

      if (remoteProjects.size === 0) {
        VSCode.window.showWarningMessage('No remote projects to display.', BIND_MANUALLY_ACTION).then(async action => {
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
            }
          ]
        });
      });
    } catch {
      VSCode.window.showErrorMessage(
        'Request Failed: Could not get the list of remote projects.' + ' Please check the connection.'
      );
    }

    itemsList.sort((i1, i2) => i1.label.localeCompare(i2.label, 'en'));
    return itemsList;
  }

  shouldBeAutoBound(workspaceFolder: VSCode.WorkspaceFolder) {
    const foldersToBeIgnored = this.workspaceState.get<string[]>(DO_NOT_ASK_ABOUT_AUTO_BINDING_FOR_FOLDER_FLAG, []);
    return !this.isBound(workspaceFolder) && !foldersToBeIgnored.includes(workspaceFolder.uri.toString());
  }

  isBound(workspaceFolder: VSCode.WorkspaceFolder) {
    const config = VSCode.workspace.getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri);
    const binding = config.get<ProjectBinding>(BINDING_SETTINGS);
    return !!binding.projectKey;
  }
}

export function showSoonUnsupportedVersionMessage(params: ShowSoonUnsupportedVersionMessageParams, workspaceState: Memento){
  const hasBeenShown = workspaceState.get<boolean>(params.doNotShowAgainId, false);
  if (!hasBeenShown) {
    VSCode.window.showWarningMessage(params.text, DONT_ASK_AGAIN_ACTION).then(async action => {
      if (action === DONT_ASK_AGAIN_ACTION) {
        workspaceState.update(params.doNotShowAgainId, true);
      }
    });
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

export interface ServerProject {
  key: string;
  name: string;
}
