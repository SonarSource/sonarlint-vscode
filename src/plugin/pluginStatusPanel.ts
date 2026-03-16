/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as VSCode from 'vscode';
import { ExtendedServer } from '../lsp/protocol';
import * as util from '../util/util';
import { escapeHtml, ResourceResolver } from '../util/webview';
import { Commands } from '../util/commands';

/** A connection option shown in the dropdown. `configScopeId` is null for standalone. */
export interface ConnectionOption {
  label: string;
  configScopeId: string | null;
}

let pluginStatusPanel: VSCode.WebviewPanel | undefined;
let currentConnections: ConnectionOption[] = [];
let currentSelectedScopeId: string | null = null;
let currentOnScopeChange: ((configScopeId: string | null) => void) | undefined;

export function showPluginStatusPanel(
  context: VSCode.ExtensionContext,
  connections: ConnectionOption[],
  statuses: ExtendedServer.PluginStatusDto[],
  selectedConfigScopeId: string | null,
  onScopeChange?: (configScopeId: string | null) => void
) {
  currentConnections = connections;
  currentSelectedScopeId = selectedConfigScopeId;
  currentOnScopeChange = onScopeChange;
  lazyCreatePluginStatusPanel(context);
  pluginStatusPanel.webview.html = computePluginStatusPanelContent(
    context,
    pluginStatusPanel.webview,
    connections,
    statuses,
    selectedConfigScopeId
  );
  pluginStatusPanel.iconPath = {
    light: util.resolveExtensionFile('images', 'sonarqube_for_ide.svg'),
    dark: util.resolveExtensionFile('images', 'sonarqube_for_ide_dark.svg')
  };
  pluginStatusPanel.reveal();
  VSCode.commands.executeCommand('workbench.action.focusFirstEditorGroup');
}

export function refreshPluginStatusPanel(
  statuses: ExtendedServer.PluginStatusDto[],
  incomingScopeId: string | null,
  context: VSCode.ExtensionContext
) {
  if (pluginStatusPanel && incomingScopeId === currentSelectedScopeId) {
    pluginStatusPanel.webview.html = computePluginStatusPanelContent(
      context,
      pluginStatusPanel.webview,
      currentConnections,
      statuses,
      currentSelectedScopeId
    );
  }
}

export function isPluginStatusPanelOpen(): boolean {
  return pluginStatusPanel !== undefined;
}

function lazyCreatePluginStatusPanel(context: VSCode.ExtensionContext) {
  if (!pluginStatusPanel) {
    pluginStatusPanel = VSCode.window.createWebviewPanel(
      'sonarlint.PluginStatuses',
      'Supported Languages & Analyzers',
      VSCode.ViewColumn.One,
      { enableScripts: true }
    );
    pluginStatusPanel.webview.onDidReceiveMessage(
      msg => {
        if (msg.command === 'setupConnection') {
          VSCode.commands.executeCommand(Commands.CONNECT_TO_SONARQUBE);
        } else if (msg.command === 'openSonarQubeProductPage') {
          VSCode.commands.executeCommand(Commands.TRIGGER_HELP_AND_FEEDBACK_LINK, 'sonarQubeProductPage');
        } else if (msg.command === 'changeScope') {
          currentOnScopeChange?.(msg.configScopeId || null);
        }
      },
      null,
      context.subscriptions
    );
    pluginStatusPanel.onDidDispose(
      () => {
        pluginStatusPanel = undefined;
        currentConnections = [];
        currentSelectedScopeId = null;
        currentOnScopeChange = undefined;
      },
      null,
      context.subscriptions
    );
  }
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

const BADGE_ABBREVIATION_LENGTH = 3;

// Language name → [abbreviation, background color, text color]
const LANGUAGE_BADGE_STYLES: Record<string, [string, string, string]> = {
  'JavaScript':  ['JS',    '#F7DF1E', '#000'],
  'TypeScript':  ['TS',    '#3178C6', '#fff'],
  'Python':      ['PY',    '#3776AB', '#fff'],
  'HTML':        ['HTML',  '#E34F26', '#fff'],
  'CSS':         ['CSS',   '#1572B6', '#fff'],
  'XML':         ['XML',   '#005FAD', '#fff'],
  'JSON':        ['JSON',  '#292929', '#fff'],
  'YAML':        ['YAML',  '#CB171E', '#fff'],
  'Java':        ['Java',  '#007396', '#fff'],
  'PHP':         ['PHP',   '#777BB4', '#fff'],
  'Go':          ['Go',    '#00ADD8', '#fff'],
  'Ruby':        ['Ruby',  '#CC342D', '#fff'],
  'Texts':       ['Txt',   '#5a5a5a', '#fff'],
  'Secrets':     ['Sec',   '#4a5568', '#fff'],
  'C':           ['C',     '#A8B9CC', '#000'],
  'C++':         ['C++',   '#00599C', '#fff'],
  'C#':          ['C#',    '#239120', '#fff'],
  'VB.NET':      ['VB',    '#512BD4', '#fff'],
  'Objective-C': ['ObjC',  '#6866FB', '#fff'],
  'Swift':       ['SW',    '#FA7343', '#fff'],
  'Kotlin':      ['Kt',    '#7F52FF', '#fff'],
  'Scala':       ['Sc',    '#DC322F', '#fff'],
  'ABAP':        ['ABAP',  '#E8274B', '#fff'],
  'Apex':        ['Apex',  '#1797C0', '#fff'],
  'COBOL':       ['COB',   '#01325A', '#fff'],
  'PL/SQL':      ['PL',    '#C41E24', '#fff'],
  'T-SQL':       ['T-SQL', '#CC2927', '#fff'],
};

export function renderLanguageBadge(pluginName: string): string {
  const style = LANGUAGE_BADGE_STYLES[pluginName];
  const [abbr, bg, color] = style ?? [pluginName.slice(0, BADGE_ABBREVIATION_LENGTH), 'rgba(128,128,128,0.35)', 'var(--vscode-foreground)'];
  return `<span class="lang-badge" title="${escapeHtml(pluginName)}" style="background:${bg};color:${color}">${escapeHtml(abbr)}</span>`;
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

export function formatSource(source: string, version: string): string {
  const v = version ? ` ${escapeHtml(version)}` : '';
  switch (source) {
    case 'EMBEDDED':
    case 'ON_DEMAND': {
      const extVersion = util.packageJson.version as string;
      return `SonarQube for VS Code ${escapeHtml(extVersion)}`;
    }
    case 'SONARQUBE_SERVER':
      return `SonarQube Server${v}`;
    case 'SONARQUBE_CLOUD':
      return `SonarQube Cloud${v}`;
    default:
      return `${escapeHtml(source)}${v}`;
  }
}

function computePluginStatusPanelContent(
  context: VSCode.ExtensionContext,
  webview: VSCode.Webview,
  connections: ConnectionOption[],
  statuses: ExtendedServer.PluginStatusDto[],
  selectedConfigScopeId: string | null
): string {
  const resolver = new ResourceResolver(context, webview);
  const themeSrc = resolver.resolve('styles', 'theme.css');
  const nonce = btoa(String.fromCodePoint(...crypto.getRandomValues(new Uint8Array(32))));

  const isStandalone = selectedConfigScopeId === null;

  const dropdownOptions = connections
    .map(connection => {
      const selected = connection.configScopeId === selectedConfigScopeId ? ' selected' : '';
      const scopeAttr = connection.configScopeId == null ? '' : escapeHtml(connection.configScopeId);
      return `<option value="${scopeAttr}"${selected}>${escapeHtml(connection.label)}</option>`;
    })
    .join('');

  const scopeSelector = connections.length > 1
    ? `<div class="scope-selector">
        <label for="scope-select">Context:</label>
        <select id="scope-select">${dropdownOptions}</select>
      </div>`
    : '';

  const premiumPluginNames = statuses
    .filter(s => resolveEnumValue(s.state, PLUGIN_STATE_BY_ORDINAL) === 'PREMIUM')
    .map(s => escapeHtml(s.pluginName ?? ''))
    .filter(Boolean);

  const extendedLanguageSupportHtml = premiumPluginNames.length > 0
    ? `<span class="premium-tooltip" title="${premiumPluginNames.join('&#10;')}">extended language support</span>`
    : `extended language support`;

  const standaloneInfoBanner = isStandalone
    ? `<div class="info-banner">
        <div class="info-banner-icon">&#x2139;</div>
        <div class="info-banner-body">
          <div class="info-banner-title">Get more from your analysis</div>
          <p>Connect to <a href="#" id="sonarqube-product-link">SonarQube Server or Cloud</a> to unlock ${extendedLanguageSupportHtml} and advanced security rules for your existing code.</p>
          <button class="info-banner-btn" id="setup-connection-btn">Set up connection</button>
        </div>
       </div>`
    : '';

  const rows = statuses
    .map(s => ({ ...s, stateStr: resolveEnumValue(s.state, PLUGIN_STATE_BY_ORDINAL), sourceStr: resolveEnumValue(s.source, ARTIFACT_SOURCE_BY_ORDINAL) }))
    .filter(s => s.stateStr !== 'PREMIUM' && s.stateStr !== 'UNSUPPORTED')
    .map(s => {
      const { stateStr, sourceStr } = s;
      const version = s.overriddenVersion ?? s.actualVersion ?? '';
      const badge = renderLanguageBadge(s.pluginName ?? '');
      const status = renderStatus(stateStr);
      const source = formatSource(sourceStr, version);
      const retryBtn = stateStr === 'FAILED'
        ? `<button class="retry-btn">Retry</button>`
        : '';
      return `<tr>
        <td class="col-name">${badge}<span class="lang-name">${escapeHtml(s.pluginName ?? '')}</span></td>
        <td class="col-status">${status}${retryBtn}</td>
        <td class="col-version">${escapeHtml(version) || '—'}</td>
        <td class="col-source">${source}</td>
      </tr>`;
    })
    .join('\n');

  const tableOrEmpty = statuses.length > 0
    ? `<table class="plugins-table">
        <thead>
          <tr>
            <th>ANALYSIS TYPE</th>
            <th>STATUS</th>
            <th>VERSION</th>
            <th>SOURCE</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`
    : '<p class="empty-state">No analyzer information available.</p>';

  return `<!doctype html><html lang="en">
    <head>
      <title>Supported Languages &amp; Analyzers</title>
      <meta http-equiv="Content-Type" content="text/html;charset=utf-8" />
      <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';"/>
      <link rel="stylesheet" type="text/css" href="${themeSrc}" />
      <style>
        body {
          font-family: var(--vscode-font-family, 'Segoe UI', Helvetica, Arial, sans-serif);
          font-size: var(--vscode-font-size, 13px);
          color: var(--vscode-editor-foreground);
          background: var(--vscode-editor-background);
          margin: 0;
          padding: 24px 32px;
          display: flex;
          justify-content: center;
        }
        .page-content {
          width: 100%;
          max-width: 960px;
        }
        h1 {
          font-size: 20px;
          font-weight: 600;
          margin: 0 0 20px 0;
        }

        /* Info banner */
        .info-banner {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          background: var(--vscode-textBlockQuote-background, rgba(100,100,255,0.1));
          border: 1px solid var(--vscode-textBlockQuote-border, #555);
          border-radius: 6px;
          padding: 16px;
          margin-bottom: 24px;
        }
        .info-banner-icon {
          font-size: 18px;
          color: var(--sonarlint-info-color, #8FCAEA);
          flex-shrink: 0;
          line-height: 1.4;
        }
        .info-banner-body { flex: 1; }
        .info-banner-title {
          font-weight: 600;
          margin-bottom: 4px;
        }
        .info-banner-body p {
          margin: 0 0 12px 0;
          color: var(--vscode-descriptionForeground, #ccc);
        }
        .info-banner-body a {
          color: var(--vscode-textLink-foreground, #4ea6dc);
          text-decoration: none;
        }
        .premium-tooltip {
          text-decoration: underline;
          text-decoration-style: dotted;
          cursor: help;
        }
        .info-banner-btn {
          background: var(--vscode-button-background, #0e639c);
          color: var(--vscode-button-foreground, #fff);
          border: none;
          border-radius: 3px;
          padding: 6px 14px;
          font-size: 12px;
          cursor: default;
          font-family: inherit;
        }

        /* Table */
        .plugins-table {
          width: 100%;
          border-collapse: collapse;
        }
        .plugins-table thead th {
          text-align: left;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.04em;
          color: var(--vscode-descriptionForeground, #999);
          padding: 0 16px 10px 0;
          border-bottom: 1px solid var(--vscode-widget-border, #444);
        }
        .plugins-table tbody tr {
          border-bottom: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.15));
        }
        .plugins-table tbody tr:last-child { border-bottom: none; }
        .plugins-table tbody td {
          padding: 10px 16px 10px 0;
          vertical-align: middle;
        }

        /* Language name column */
        .col-name {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .lang-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          min-width: 24px;
          min-height: 24px;
          aspect-ratio: 1 / 1;
          font-size: 7px;
          font-weight: 600;
          line-height: 1;
          border-radius: 2px;
          flex-shrink: 0;
          letter-spacing: 0.02em;
          border: none;
          overflow: hidden;
          box-sizing: border-box;
        }
        .lang-name { font-weight: 500; }

        /* Status column */
        .col-status { white-space: nowrap; }
        .status { display: inline-flex; align-items: center; gap: 5px; }
        .status-dot { font-size: 10px; }
        .status-active      { color: #4CAF50; }
        .status-failed      { color: #F44336; }
        .status-downloading { color: #FF9800; }
        .status-synced      { color: #4CAF50; }

        /* Retry button */
        .retry-btn {
          margin-left: 8px;
          background: var(--vscode-button-secondaryBackground, #3a3d41);
          color: var(--vscode-button-secondaryForeground, #ccc);
          border: 1px solid var(--vscode-button-border, #555);
          border-radius: 3px;
          padding: 2px 10px;
          font-size: 11px;
          cursor: default;
          font-family: inherit;
          vertical-align: middle;
        }

        /* Version / source columns */
        .col-version { font-family: monospace; font-size: 12px; color: var(--vscode-descriptionForeground, #999); }
        .col-source  { color: var(--vscode-descriptionForeground, #ccc); }

        .empty-state { color: var(--vscode-descriptionForeground, #999); margin-top: 24px; }

        /* Scope selector */
        .scope-selector {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 20px;
        }
        .scope-selector label {
          font-size: 13px;
          color: var(--vscode-descriptionForeground, #999);
          white-space: nowrap;
        }
        .scope-selector select {
          background: var(--vscode-dropdown-background, #3c3c3c);
          color: var(--vscode-dropdown-foreground, #ccc);
          border: 1px solid var(--vscode-dropdown-border, #555);
          border-radius: 2px;
          padding: 4px 8px;
          font-size: 13px;
          font-family: inherit;
          min-width: 220px;
          cursor: default;
        }
      </style>
    </head>
    <body>
      <div class="page-content">
        <h1>Supported Languages &amp; Analyzers</h1>
        ${scopeSelector}
        ${standaloneInfoBanner}
        ${tableOrEmpty}
      </div>
      <script nonce="${nonce}">
        (function() {
          const vscodeApi = acquireVsCodeApi();

          const setupBtn = document.getElementById('setup-connection-btn');
          if (setupBtn) {
            setupBtn.addEventListener('click', function() {
              vscodeApi.postMessage({ command: 'setupConnection' });
            });
          }

          const sonarQubeLink = document.getElementById('sonarqube-product-link');
          if (sonarQubeLink) {
            sonarQubeLink.addEventListener('click', function(e) {
              e.preventDefault();
              vscodeApi.postMessage({ command: 'openSonarQubeProductPage' });
            });
          }

          const scopeSelect = document.getElementById('scope-select');
          if (scopeSelect) {
            scopeSelect.addEventListener('change', function() {
              vscodeApi.postMessage({ command: 'changeScope', configScopeId: scopeSelect.value || null });
            });
          }
        })();
      </script>
    </body>
  </html>`;
}

