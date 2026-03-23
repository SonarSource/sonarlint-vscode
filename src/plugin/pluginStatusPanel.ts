/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as fs from 'node:fs';
import * as VSCode from 'vscode';
import { ExtendedServer } from '../lsp/protocol';
import * as util from '../util/util';
import { escapeHtml, ResourceResolver } from '../util/webview';
import { Commands } from '../util/commands';

import { BindingService } from '../connected/binding';
import { code2ProtocolConverter } from '../util/uri';
import { IdeLabsFlagManagementService } from '../labs/ideLabsFlagManagementService';
import { SonarLintExtendedLanguageClient } from '../lsp/client';
import { ConnectionSettingsService } from '../settings/connectionsettings';

const WEBVIEW_UI_DIR = 'webview-ui';

export interface FolderOption {
  label: string;
  configScopeId: string;
  isStandalone: boolean;
}

export const PLUGIN_STATE_BY_ORDINAL: Record<number, string> = {
  0: 'ACTIVE',
  1: 'SYNCED',
  2: 'DOWNLOADING',
  3: 'FAILED',
  4: 'PREMIUM',
  5: 'UNSUPPORTED'
};

export const ARTIFACT_SOURCE_BY_ORDINAL: Record<number, string> = {
  0: 'EMBEDDED',
  1: 'ON_DEMAND',
  2: 'SONARQUBE_SERVER',
  3: 'SONARQUBE_CLOUD'
};

export function resolveEnumValue(value: unknown, byOrdinal: Record<number, string>): string {
  if (typeof value === 'number') {
    return byOrdinal[value] ?? String(value);
  }
  if (typeof value === 'string') {
    return value;
  }
  return '';
}

export class PluginStatusPanel {
  private static instance?: PluginStatusPanel;

  private readonly panel: VSCode.WebviewPanel;
  private readonly languageClient: SonarLintExtendedLanguageClient;
  private folders: FolderOption[] = [];
  private selectedScopeId = '';

  private constructor(panel: VSCode.WebviewPanel, languageClient: SonarLintExtendedLanguageClient) {
    this.panel = panel;
    this.languageClient = languageClient;
  }

  private getFolders(): FolderOption[] {
    const bindingState = BindingService.instance.bindingStatePerFolder();
    return (VSCode.workspace.workspaceFolders ?? []).map(folder => {
      const connectionId = BindingService.instance.getConnectionIdForFolder(folder);
      return {
        label: connectionId ? `${folder.name} (${connectionId})` : folder.name,
        configScopeId: code2ProtocolConverter(folder.uri),
        isStandalone: !bindingState.get(folder.uri)
      };
    });
  }

  public static async showSupportedLanguages(
    context: VSCode.ExtensionContext,
    languageClient: SonarLintExtendedLanguageClient
  ) {
    if (!IdeLabsFlagManagementService.instance.isIdeLabsEnabled()) {
      return;
    }

    if (!PluginStatusPanel.instance) {
      PluginStatusPanel.create(context, languageClient);
    }

    await PluginStatusPanel.instance.fetchAndShow();
  }

  private static create(context: VSCode.ExtensionContext, languageClient: SonarLintExtendedLanguageClient) {
    const panel = VSCode.window.createWebviewPanel(
      'sonarlint.PluginStatuses',
      'Supported Languages & Analyzers',
      VSCode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [context.extensionUri]
      }
    );

    panel.iconPath = {
      light: util.resolveExtensionFile('images', 'sonarqube_for_ide.svg'),
      dark: util.resolveExtensionFile('images', 'sonarqube_for_ide_dark.svg')
    };

    const instance = new PluginStatusPanel(panel, languageClient);
    PluginStatusPanel.instance = instance;

    panel.webview.onDidReceiveMessage(msg => instance.handleMessage(msg), null, context.subscriptions);

    panel.onDidDispose(
      () => {
        PluginStatusPanel.instance = undefined;
      },
      null,
      context.subscriptions
    );
  }

  private handleMessage(msg: { command: string; configScopeId?: string }) {
    switch (msg.command) {
      case 'setupConnection':
        VSCode.commands.executeCommand(Commands.CONNECT_TO_SONARCLOUD);
        break;
      case 'bindProject':
        VSCode.commands.executeCommand(Commands.AUTO_BIND_WORKSPACE_FOLDERS);
        break;
      case 'openSonarQubeProductPage':
        VSCode.commands.executeCommand(Commands.TRIGGER_HELP_AND_FEEDBACK_LINK, 'sonarQubeProductPage');
        break;
      case 'changeScope':
        this.fetchAndShow(msg.configScopeId);
        break;
    }
  }

  private async fetchAndShow(configScopeId?: string) {
    this.folders = this.getFolders();
    let statuses: ExtendedServer.PluginStatusDto[] = [];
    let scopeForApi: string | null = null;

    if (this.folders.length > 0) {
      if (!configScopeId) {
        configScopeId = this.selectedScopeId || this.folders[0].configScopeId;
      }

      let folder = this.folders.find(f => f.configScopeId === configScopeId);
      if (!folder) {
        folder = this.folders[0];
        configScopeId = folder.configScopeId;
      }
      this.selectedScopeId = configScopeId;
      scopeForApi = folder.isStandalone ? null : configScopeId || null;
    } else {
      this.selectedScopeId = '';
    }

    try {
      const response = await this.languageClient.getPluginStatuses(scopeForApi);
      statuses = response?.pluginStatuses ?? [];
    } catch (e) {
      VSCode.window.showErrorMessage(
        `Could not retrieve plugin statuses: ${e instanceof Error ? e.message : String(e)}`
      );
      return;
    }

    if (this.panel.webview.html) {
      this.panel.webview.postMessage({
        command: 'updateContent',
        html: renderContent(statuses, this.selectedScopeId, this.folders),
        scopeSelectorHtml: renderScopeSelector(this.folders, this.selectedScopeId)
      });
    } else {
      this.panel.webview.html = computeFullHtml(
        util.extensionContext,
        this.panel.webview,
        this.folders,
        statuses,
        this.selectedScopeId
      );
    }

    this.panel.reveal();
    VSCode.commands.executeCommand('workbench.action.focusFirstEditorGroup');
  }

  public static async refresh(statuses: ExtendedServer.PluginStatusDto[], updatedScopeId: string) {
    const instance = PluginStatusPanel.instance;
    if (!instance) {
      return;
    }

    instance.folders = instance.getFolders();

    let currentScopeId = instance.selectedScopeId;
    const folderExists = instance.folders.find(f => f.configScopeId === currentScopeId);

    if (instance.folders.length === 0) {
      instance.selectedScopeId = '';
      if (updatedScopeId === '') {
        instance.panel.webview.postMessage({
          command: 'updateContent',
          html: renderContent(statuses, '', []),
          scopeSelectorHtml: renderScopeSelector([], '')
        });
      }
      return;
    } else if (!folderExists) {
      currentScopeId = instance.folders[0].configScopeId;
      // In case the active folder has been deleted from the workspace, fetch again for the new folder
      await instance.fetchAndShow(currentScopeId);
      return;
    }

    if (currentScopeId !== updatedScopeId) {
      // The background sync was for a folder we aren't currently viewing.
      // Ignore the pushed statuses, but update the dropdown in case workspace folders were added/removed.
      instance.panel.webview.postMessage({
        command: 'updateContent',
        scopeSelectorHtml: renderScopeSelector(instance.folders, currentScopeId)
      });
      return;
    }

    instance.panel.webview.postMessage({
      command: 'updateContent',
      html: renderContent(statuses, currentScopeId, instance.folders),
      scopeSelectorHtml: renderScopeSelector(instance.folders, currentScopeId)
    });
  }

  public static isOpen(): boolean {
    return PluginStatusPanel.instance !== undefined;
  }
}

export function renderStatus(state: string): string {
  switch (state) {
    case 'ACTIVE':
      return `<span class="status status-active"><span class="status-dot">&#x25CF;</span>Active</span>`;
    case 'FAILED':
      return `<span class="status status-failed"><span class="status-dot">&#x25CF;</span>Failed</span>`;
    case 'DOWNLOADING':
      return `<span class="status status-downloading"><span class="status-dot">&#x25CF;</span>Downloading...</span>`;
    case 'SYNCED':
      return `<span class="status status-synced"><span class="status-dot">&#x25CF;</span>Synced</span>`;
    default:
      return `<span class="status">${escapeHtml(state)}</span>`;
  }
}

export function formatSource(source: string, serverVersion?: string): string {
  switch (source) {
    case 'EMBEDDED':
    case 'ON_DEMAND': {
      const extVersion = util.packageJson.version as string;
      return `SonarQube for VS Code ${escapeHtml(extVersion)}`;
    }
    case 'SONARQUBE_SERVER':
      return serverVersion ? `SonarQube Server ${escapeHtml(serverVersion)}` : 'SonarQube Server';
    case 'SONARQUBE_CLOUD':
      return 'SonarQube Cloud';
    default:
      return escapeHtml(source);
  }
}

function renderScopeSelector(folders: FolderOption[], selectedConfigScopeId: string): string {
  if (folders.length <= 1) {
    return '';
  }
  const options = folders
    .map(folder => {
      const selected = folder.configScopeId === selectedConfigScopeId ? ' selected' : '';
      return `<option value="${escapeHtml(folder.configScopeId)}"${selected}>${escapeHtml(folder.label)}</option>`;
    })
    .join('');
  return `<div class="scope-selector">
      <label for="scope-select">Folder:</label>
      <select id="scope-select">${options}</select>
    </div>`;
}

function renderInfoBanner(statuses: ExtendedServer.PluginStatusDto[], isStandalone: boolean): string {
  if (!isStandalone) {
    return '';
  }
  const hasConnection = ConnectionSettingsService.instance.hasConnectionConfigured();
  const premiumPluginNames = statuses
    .filter(s => resolveEnumValue(s.state, PLUGIN_STATE_BY_ORDINAL) === 'PREMIUM')
    .map(s => escapeHtml(s.pluginName ?? ''))
    .filter(Boolean);
  const extendedLanguageSupportHtml = premiumPluginNames.length > 0
    ? `<span class="premium-tooltip" title="${premiumPluginNames.join('&#10;')}">extended language support</span>`
    : 'extended language support';
    
  const buttonId = hasConnection ? 'bind-project-btn' : 'setup-connection-btn';
  const buttonText = hasConnection ? 'Bind Project' : 'Set up connection';

  return `<div class="info-banner">
      <div class="info-banner-icon">&#x2139;</div>
      <div class="info-banner-body">
        <div class="info-banner-title">Get more from your analysis</div>
        <p>Connect to <a href="#" id="sonarqube-product-link">SonarQube Server or Cloud</a> to unlock ${extendedLanguageSupportHtml} and advanced security rules for your existing code.</p>
        <button class="info-banner-btn" id="${buttonId}">${buttonText}</button>
      </div>
    </div>`;
}

function renderTable(statuses: ExtendedServer.PluginStatusDto[]): string {
  const rows = statuses
    .map(s => ({ ...s, stateStr: resolveEnumValue(s.state, PLUGIN_STATE_BY_ORDINAL), sourceStr: resolveEnumValue(s.source, ARTIFACT_SOURCE_BY_ORDINAL) }))
    .filter(s => s.stateStr !== 'PREMIUM' && s.stateStr !== 'UNSUPPORTED')
    .map(s => {
      const status = renderStatus(s.stateStr);
      const source = formatSource(s.sourceStr, s.serverVersion);
      const name = escapeHtml(s.pluginName ?? '');
      return `<tr>
        <td class="col-name lang-name" data-sort="${name}">${name}</td>
        <td class="col-status" data-sort="${escapeHtml(s.stateStr)}">${status}</td>
        <td class="col-source" data-sort="${escapeHtml(s.sourceStr)}">${source}</td>
      </tr>`;
    });
  if (rows.length === 0) {
    return '<p class="empty-state">No analyzer information available.</p>';
  }
  return `<table class="plugins-table">
      <thead>
        <tr>
          <th aria-sort="none"><button class="sort-btn" data-col="0">LANGUAGE/ANALYZER<span class="sort-indicator" aria-hidden="true"></span></button></th>
          <th aria-sort="none"><button class="sort-btn" data-col="1">STATUS<span class="sort-indicator" aria-hidden="true"></span></button></th>
          <th aria-sort="none"><button class="sort-btn" data-col="2">SOURCE<span class="sort-indicator" aria-hidden="true"></span></button></th>
        </tr>
      </thead>
      <tbody>${rows.join('\n')}</tbody>
    </table>`;
}

function isSelectedFolderStandalone(folders: FolderOption[], selectedConfigScopeId: string): boolean {
  if (folders.length === 0 || !selectedConfigScopeId) {
    return true;
  }
  return folders.find(f => f.configScopeId === selectedConfigScopeId)?.isStandalone ?? false;
}

function renderContent(statuses: ExtendedServer.PluginStatusDto[], selectedConfigScopeId: string, folders: FolderOption[]): string {
  return renderInfoBanner(statuses, isSelectedFolderStandalone(folders, selectedConfigScopeId)) + renderTable(statuses);
}

function computeFullHtml(
  context: VSCode.ExtensionContext,
  webview: VSCode.Webview,
  folders: FolderOption[],
  statuses: ExtendedServer.PluginStatusDto[],
  selectedConfigScopeId: string
): string {
  const resolver = new ResourceResolver(context, webview);
  const themeSrc = resolver.resolve('styles', 'theme.css');
  const pluginStatusSrc = resolver.resolve('styles', 'pluginStatus.css');
  const scriptSrc = resolver.resolve(WEBVIEW_UI_DIR, 'pluginStatus.js');

  const templatePath = util.resolveExtensionFile(WEBVIEW_UI_DIR, 'pluginStatus.html');
  const template = fs.readFileSync(templatePath.fsPath, 'utf-8');

  return template
    .replaceAll('{{cspSource}}', webview.cspSource)
    .replace('{{themeSrc}}', themeSrc)
    .replace('{{pluginStatusSrc}}', pluginStatusSrc)
    .replace('{{scopeSelector}}', renderScopeSelector(folders, selectedConfigScopeId))
    .replace('{{infoBanner}}', renderInfoBanner(statuses, isSelectedFolderStandalone(folders, selectedConfigScopeId)))
    .replace('{{table}}', renderTable(statuses))
    .replace('{{scriptSrc}}', scriptSrc);
}
