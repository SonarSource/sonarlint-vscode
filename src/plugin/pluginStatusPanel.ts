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
import { ResourceResolver } from '../util/webview';

let pluginStatusPanel: VSCode.WebviewPanel | undefined;

export function showPluginStatusPanel(
  context: VSCode.ExtensionContext,
  statuses: ExtendedServer.PluginStatusDto[],
  isStandalone: boolean
) {
  lazyCreatePluginStatusPanel(context);
  pluginStatusPanel.webview.html = computePluginStatusPanelContent(
    context,
    pluginStatusPanel.webview,
    statuses,
    isStandalone
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
  isStandalone: boolean,
  context: VSCode.ExtensionContext
) {
  if (pluginStatusPanel) {
    pluginStatusPanel.webview.html = computePluginStatusPanelContent(
      context,
      pluginStatusPanel.webview,
      statuses,
      isStandalone
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
      {
        enableScripts: false
      }
    );
    pluginStatusPanel.onDidDispose(
      () => {
        pluginStatusPanel = undefined;
      },
      null,
      context.subscriptions
    );
  }
}

function computePluginStatusPanelContent(
  context: VSCode.ExtensionContext,
  webview: VSCode.Webview,
  statuses: ExtendedServer.PluginStatusDto[],
  isStandalone: boolean
): string {
  const resolver = new ResourceResolver(context, webview);
  const themeSrc = resolver.resolve('styles', 'theme.css');
  const ruleSrc = resolver.resolve('styles', 'rule.css');

  const standaloneInfoBanner = isStandalone
    ? `<div class="info-banner-wrapper">
        <p class="info-banner">
          Get more from your analysis. Connect to SonarQube Server or Cloud to unlock extended analyzer support.
        </p>
       </div>`
    : '';

  const rows = statuses
    .map(s => {
      const dot = renderStateDot(s.state);
      const version = s.overriddenVersion
        ? `${s.overriddenVersion} <small>(overrides ${s.actualVersion ?? '—'})</small>`
        : s.actualVersion ?? '—';
      return `<tr>
        <td>${escapeHtml(s.pluginName)}</td>
        <td>${dot}${escapeHtml(s.state)}</td>
        <td>${version}</td>
        <td>${escapeHtml(s.source)}</td>
      </tr>`;
    })
    .join('\n');

  const table =
    statuses.length > 0
      ? `<table class="rule-params">
          <thead>
            <tr>
              <th>Analysis Type</th>
              <th>Status</th>
              <th>Version</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>`
      : '<p>No analyzer information available.</p>';

  return `<!doctype html><html lang="en">
    <head>
      <title>Supported Languages &amp; Analyzers</title>
      <meta http-equiv="Content-Type" content="text/html;charset=utf-8" />
      <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource}"/>
      <link rel="stylesheet" type="text/css" href="${themeSrc}" />
      <link rel="stylesheet" type="text/css" href="${ruleSrc}" />
      <style>
        .status-dot { display: inline-block; width: 0.6em; height: 0.6em; border-radius: 50%; margin-right: 0.4em; vertical-align: middle; }
        .status-dot-active   { background-color: #4CAF50; }
        .status-dot-failed   { background-color: #F44336; }
        .status-dot-downloading { background-color: #FF9800; }
      </style>
    </head>
    <body>
      <h1>Supported Languages &amp; Analyzers</h1>
      ${standaloneInfoBanner}
      ${table}
    </body>
  </html>`;
}

function renderStateDot(state: ExtendedServer.PluginStateDto): string {
  switch (state) {
    case 'ACTIVE':
      return '<span class="status-dot status-dot-active" title="Active"></span>';
    case 'FAILED':
      return '<span class="status-dot status-dot-failed" title="Failed"></span>';
    case 'DOWNLOADING':
      return '<span class="status-dot status-dot-downloading" title="Downloading"></span>';
    default:
      return '';
  }
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
