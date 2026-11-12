/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) SonarSource Sàrl
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
import { buildProjectOverviewBaseServerUrl, projectToQuickPickItem, serverProjectsToQuickPickItems } from '../util/bindingUtils';
import { code2ProtocolConverter } from '../util/uri';
import { DEFAULT_CONNECTION_ID } from '../commons';
import { ExtendedClient, ExtendedServer } from '../lsp/protocol';
import { DONT_ASK_AGAIN_ACTION } from '../util/showMessage';
import { SharedConnectedModeSettingsService } from './sharedConnectedModeSettingsService';
import { showRemoteProjectQuickPick } from './remoteProjectQuickPick';
import OPEN_BROWSER = Commands.OPEN_BROWSER;

const SONARLINT_CATEGORY = 'sonarlint';
const BINDING_SETTINGS = 'connectedMode.project';
const OPEN_FOLDER_ACTION = 'Open Folder';
const BIND_MANUALLY_ACTION = 'Bind Manually';

async function bindManuallyAction(workspaceFolder: VSCode.WorkspaceFolder) {
  const existingSettings = VSCode.workspace
    .getConfiguration(SONARLINT_CATEGORY, workspaceFolder)
    .get<ProjectBinding>(BINDING_SETTINGS);
  if (existingSettings.projectKey === undefined) {
    await VSCode.workspace
      .getConfiguration(SONARLINT_CATEGORY, workspaceFolder)
      .update(BINDING_SETTINGS, { connectionId: '', projectKey: '' });
    await this.languageClient.addedManualBindings();
  }
  VSCode.commands.executeCommand('workbench.action.openFolderSettingsFile');
}

export class BindingService {
  private static _instance: BindingService;

  private bindings: ExtendedServer.BindingInfo[] = [];
  private refreshing: Promise<void> = Promise.resolve();
  private warnedAboutUnresolvedBindings = false;
  private readonly _onDidChangeBindings = new VSCode.EventEmitter<void>();
  readonly onDidChangeBindings = this._onDidChangeBindings.event;

  static init(
    languageClient: SonarLintExtendedLanguageClient,
    workspaceState: VSCode.Memento,
    settingsService: ConnectionSettingsService,
    sharedConnectedModeSettingsService: SharedConnectedModeSettingsService
  ): void {
    BindingService._instance = new BindingService(languageClient, workspaceState, settingsService, sharedConnectedModeSettingsService);
  }

  constructor(
    private readonly languageClient: SonarLintExtendedLanguageClient,
    private readonly workspaceState: VSCode.Memento,
    private readonly settingsService: ConnectionSettingsService,
    private readonly sharedConnectedModeSettingsService: SharedConnectedModeSettingsService
  ) {}

  static get instance(): BindingService {
    return BindingService._instance;
  }

  /**
   * Asks the language server for the binding of every scope, whichever source declares it: the folder settings or a
   * `.sonar-config.json`.
   */
  refreshBindings(): void {
    this.refreshing = this.refreshing.then(async () => {
      this.bindings = await this.languageClient.getBindings().catch(() => this.bindings);
      this._onDidChangeBindings.fire();
      this.warnOnceAboutUnresolvedBindings();
    });
  }

  private warnOnceAboutUnresolvedBindings(): void {
    const count = this.unresolvedBindings().length;
    if (this.warnedAboutUnresolvedBindings || count === 0) {
      return;
    }
    this.warnedAboutUnresolvedBindings = true;
    const showAction = 'Show';
    const subject = count === 1 ? '1 folder is' : `${count} folders are`;
    VSCode.window
      .showWarningMessage(`${subject} bound to a project whose connection is not configured.`, showAction)
      .then(action => (action === showAction ? VSCode.commands.executeCommand('SonarLint.ConnectedMode.focus') : undefined));
  }

  allBindings(): ExtendedServer.BindingInfo[] {
    return this.bindings.filter(binding => binding.status !== 'MISSING_CONNECTION');
  }

  unresolvedBindings(): ExtendedServer.BindingInfo[] {
    return this.bindings.filter(binding => binding.status === 'MISSING_CONNECTION');
  }

  getBoundProjectKeys(connectionId: string): string[] {
    return [...new Set(this.bindingsOf(connectionId).map(binding => binding.projectKey))];
  }

  getBindingsOfProject(connectionId: string, projectKey: string): ExtendedServer.BindingInfo[] {
    return this.bindingsOf(connectionId).filter(binding => binding.projectKey === projectKey);
  }

  private bindingsOf(connectionId: string): ExtendedServer.BindingInfo[] {
    return this.allBindings().filter(binding => (binding.connectionId || DEFAULT_CONNECTION_ID) === (connectionId || DEFAULT_CONNECTION_ID));
  }

  async deleteBindingWithConfirmation(binding: WorkspaceFolderItem): Promise<void> {
    const deleteAction = 'Delete';
    const confirm = await VSCode.window.showWarningMessage(
      `Are you sure you want to delete ${binding.serverType} project binding '${binding.name}'?`,
      { modal: true },
      deleteAction
    );
    if (confirm !== deleteAction) {
      return undefined;
    }
    return this.deleteBinding(binding);
  }

  async deleteBinding(workspaceFolderItem: WorkspaceFolderItem): Promise<void> {
    return this.clearBindingSetting(workspaceFolderItem.uri);
  }

  async removeBindingsOfFolders(folderUris: string[]): Promise<void> {
    for (const folderUri of folderUris) {
      const folder = VSCode.workspace.getWorkspaceFolder(VSCode.Uri.parse(folderUri));
      if (folder) {
        await this.clearBindingSetting(folder);
      }
    }
  }

  private async clearBindingSetting(folder: VSCode.WorkspaceFolder): Promise<void> {
    const config = VSCode.workspace.getConfiguration(SONARLINT_CATEGORY, folder);
    return config.update(BINDING_SETTINGS, undefined, VSCode.ConfigurationTarget.WorkspaceFolder);
  }

  bindingStatePerFolder(): Map<VSCode.Uri, boolean> {
    const bindingStatePerFolder = new Map<VSCode.Uri, boolean>();
    for (const folder of VSCode.workspace.workspaceFolders || []) {
      const config = VSCode.workspace.getConfiguration(SONARLINT_CATEGORY, folder.uri);
      const binding = config.get<ProjectBinding>(BINDING_SETTINGS);
      bindingStatePerFolder.set(folder.uri, binding.projectKey !== undefined);
    }
    return bindingStatePerFolder;
  }

  async assistBinding(params: ExtendedClient.AssistBindingParams) {
    const workspaceFolders = VSCode.workspace.workspaceFolders;
    const selectedWorkspaceFolderName = await this.showFolderSelectionQuickPickOrReturnDefaultSelection(
      workspaceFolders
    );
    const workspaceFolder = workspaceFolders.find(f => f.name === selectedWorkspaceFolderName);

    await VSCode.workspace
      .getConfiguration(SONARLINT_CATEGORY, workspaceFolder)
      .update(BINDING_SETTINGS, { connectionId: params.connectionId, projectKey: params.projectKey });
    await this.languageClient.acceptedBindingSuggestion(params.origin);

    return { configurationScopeId: workspaceFolder.uri.toString() };
  }

  async createOrEditBinding(
    connectionId: string,
    contextValue: string,
    workspaceFolder?: VSCode.WorkspaceFolder,
    serverType?: ServerType
  ) {
    if (!this.isRelatedConnectionValid(connectionId)) {
      VSCode.window.showErrorMessage(`Connection '${connectionId}' is not working. You cannot create a binding for a non-working connection.
      Please fix the connection and try again.`);
      return;
    }
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
      serverType = contextValue === 'sonarqubeConnection' ? ServerType.SonarQube : ServerType.SonarCloud;
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
  
  isRelatedConnectionValid(connectionId: string) : boolean {
    return this.settingsService.getStatusForConnection(connectionId)?.success ?? false;
  }
  
  async getBaseServerUrl(connectionId: string, serverType: ServerType): Promise<string> {
    let serverUrlOrOrganizationKey: string;
    let region = undefined;
    if (serverType === ServerType.SonarQube) {
      serverUrlOrOrganizationKey = (await this.settingsService.loadSonarQubeConnection(connectionId)).serverUrl;
    } else {
      const sonarCloudConnection = await this.settingsService.loadSonarCloudConnection(connectionId);
      serverUrlOrOrganizationKey = sonarCloudConnection.organizationKey;
      region = sonarCloudConnection.region;
    }
    return buildProjectOverviewBaseServerUrl(serverType, serverUrlOrOrganizationKey, region);
  }

  private async pickRemoteProjectToBind(
    connectionId: string,
    workspaceFolder: VSCode.WorkspaceFolder,
    serverType: ServerType,
    selectedFolderName
  ) {
    if (!workspaceFolder) {
      return;
    }
    const baseServerUrl = await this.getBaseServerUrl(connectionId, serverType);
    const suggestedProjects = await this.getSuggestedItems(connectionId, workspaceFolder, serverType);
    const remoteProjects = await this.getRemoteProjectsItems(connectionId, workspaceFolder, serverType);
    const remoteProjectsItems = this.deduplicateQuickPickItems(suggestedProjects, remoteProjects);
    showRemoteProjectQuickPick({
      selectedFolderName,
      serverType,
      initialItems: [
        { label: 'Suggested Projects', kind: VSCode.QuickPickItemKind.Separator },
        ...suggestedProjects,
        { label: 'All Projects', kind: VSCode.QuickPickItemKind.Separator },
        ...remoteProjectsItems
      ],
      searchProjects: searchText => this.languageClient.fuzzySearchProjects(connectionId || DEFAULT_CONNECTION_ID, searchText),
      onAccept: projectKey => { void this.saveManualBinding(projectKey, workspaceFolder, connectionId); },
      onOpenInBrowser: projectKey => {
        VSCode.commands.executeCommand(Commands.OPEN_BROWSER, VSCode.Uri.parse(`${baseServerUrl}?id=${projectKey}`));
      }
    });
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

  async saveSuggestedBinding(projectKey: string, workspaceFolder: VSCode.WorkspaceFolder, suggestionOrigin: ExtendedServer.BindingSuggestionOrigin, connectionId?: string) {
    connectionId = connectionId || DEFAULT_CONNECTION_ID;
    await VSCode.workspace
      .getConfiguration(SONARLINT_CATEGORY, workspaceFolder)
      .update(BINDING_SETTINGS, { connectionId, projectKey });
    await this.languageClient.acceptedBindingSuggestion(suggestionOrigin);

    VSCode.window.showInformationMessage(`Workspace folder '${workspaceFolder.name}/' has been bound with project '${projectKey}'`);

    // Focus on the Findings view
    VSCode.commands.executeCommand('SonarQube.Findings.focus');
  }

  async saveManualBinding(projectKey: string, workspaceFolder: VSCode.WorkspaceFolder, connectionId?: string) {
        connectionId = connectionId || DEFAULT_CONNECTION_ID;
    await VSCode.workspace
      .getConfiguration(SONARLINT_CATEGORY, workspaceFolder)
      .update(BINDING_SETTINGS, { connectionId, projectKey });
    await this.languageClient.addedManualBindings();

    VSCode.window.showInformationMessage(`Workspace folder '${workspaceFolder.name}/' has been bound with project '${projectKey}'`);

    void this.proposeSharingConfig(projectKey, workspaceFolder);

    // Focus on the Findings view
    VSCode.commands.executeCommand('SonarQube.Findings.focus');
  }

  private async proposeSharingConfig(projectKey: string, workspaceFolder: VSCode.WorkspaceFolder) {
    const SHARE_CONFIGURATION_ACTION = 'Share configuration';
    const LEARN_MORE_ACTION = 'Learn more';

    const selection = await VSCode.window.showInformationMessage(`Do you want to share this new SonarQube Connected Mode configuration?
    A configuration file will be created in this working directory. This will allow your team to reuse the binding configuration`,
      SHARE_CONFIGURATION_ACTION, LEARN_MORE_ACTION);
    if (selection === SHARE_CONFIGURATION_ACTION) {
      await this.sharedConnectedModeSettingsService.createSharedConnectedModeSettingsFile(workspaceFolder);
    } else if (selection === LEARN_MORE_ACTION) {
      await VSCode.commands.executeCommand(OPEN_BROWSER, VSCode.Uri.parse('https://docs.sonarsource.com/sonarqube-for-vs-code/connect-your-ide/setup/#reuse-the-binding-configuration'));
    }
  }

  private async promptToBindManually(workspaceFolder: VSCode.WorkspaceFolder) {
    const action = await VSCode.window.showWarningMessage('No remote projects to display.', BIND_MANUALLY_ACTION);
    if (action === BIND_MANUALLY_ACTION) {
      await bindManuallyAction(workspaceFolder);
    }
  }

  async getRemoteProjects(connectionId: string) {
    return this.languageClient.getRemoteProjectsForConnection(connectionId);
  }

  async getRemoteProjectsItems(connectionId: string, workspaceFolder: VSCode.WorkspaceFolder, serverType: ServerType) {
    const getRemoteProjectsParam = connectionId || DEFAULT_CONNECTION_ID;
    const itemsList: VSCode.QuickPickItem[] = [];

    try {
      let remoteProjects = await this.getRemoteProjects(getRemoteProjectsParam);
      if (!(remoteProjects instanceof Map)) {
        remoteProjects = new Map(Object.entries(remoteProjects));
      }

      if (remoteProjects.size === 0) {
        void this.promptToBindManually(workspaceFolder);
      }

      remoteProjects.forEach((v, k) => {
        itemsList.push(projectToQuickPickItem({ key: k, name: v }, serverType));
      });
    } catch {
      VSCode.window.showErrorMessage(
        'Request Failed: Could not get the list of remote projects.' + ' Please check the connection.'
      );
    }

    itemsList.sort((i1, i2) => i1.label.localeCompare(i2.label, 'en'));
    return itemsList;
  }

  isBound(workspaceFolder: VSCode.WorkspaceFolder) {
    const config = VSCode.workspace.getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri);
    const binding = config.get<ProjectBinding>(BINDING_SETTINGS);
    return !!binding.projectKey;
  }
}

export function showSoonUnsupportedVersionMessage(params: ExtendedClient.ShowSoonUnsupportedVersionMessageParams, workspaceState: Memento){
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

export type { ServerProject } from '../lsp/protocol';
