/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { RemediationEvent, RemediationEventType } from './remediationEvent';
import { ResourceResolver } from '../util/webview';
import { getFileNameFromFullPath, getRelativePathFromFullPath } from '../util/uri';
import * as vscode from 'vscode';

export function generateRemediationPanelContent(
  events: ReadonlyArray<RemediationEvent>,
  resolver: ResourceResolver,
  cspSource: string,
  nonce: string
): string {
  const themeCss = resolver.resolve('styles', 'theme.css');
  const remediationCss = resolver.resolve('styles', 'remediation.css');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource}; style-src ${cspSource}; script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${themeCss}">
  <link rel="stylesheet" href="${remediationCss}">
  <title>SonarQube for IDE Remediation</title>
</head>
<body>
  <div class="remediation-container">
    ${events.length === 0 ? renderEmptyState() : renderEventList(events, resolver)}
  </div>
  <script nonce="${nonce}">
    (function() {
      const vscode = acquireVsCodeApi();

      document.querySelectorAll('.event-item').forEach(item => {
        item.addEventListener('click', () => {
          const eventId = item.getAttribute('data-event-id');
          vscode.postMessage({ command: 'navigateToEvent', eventId });
        });
      });
    })();
  </script>
</body>
</html>`;
}

function renderEventList(events: ReadonlyArray<RemediationEvent>, resolver: ResourceResolver): string {
  return `<div class="event-list">
    ${events.map(event => renderEventItem(event, resolver)).join('')}
  </div>`;
}

function renderEventItem(event: RemediationEvent, resolver: ResourceResolver): string {
  const typeLabel = getEventTypeLabel(event.type);
  const timeAgo = formatTimeAgo(event.timestamp);
  const message = escapeHtml(event.message);
  const ruleKey = event.ruleKey ? escapeHtml(event.ruleKey) : '';

  // Extract filename and directory path
  const fileName = escapeHtml(getFileNameFromFullPath(event.fileUri));
  const uri = vscode.Uri.parse(event.fileUri);
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
  const specifyWorkspaceFolderName = vscode.workspace.workspaceFolders?.length > 1;

  let dirPath = '';
  if (workspaceFolder) {
    dirPath = escapeHtml(getRelativePathFromFullPath(
      event.fileUri,
      workspaceFolder,
      specifyWorkspaceFolderName
    ));
  }

  const fullPath = escapeHtml(event.filePath);

  return `<div class="event-item" data-event-id="${event.id}">
    <div class="event-details">
      <div class="event-header">
        <span class="event-type">${typeLabel}</span>
        <span class="event-time">${timeAgo}</span>
      </div>
      <div class="event-message">${message}</div>
      <div class="event-metadata">
        <span class="event-file" title="${fullPath}">
          <span class="file-name">${fileName}</span>
          ${dirPath ? `<span class="file-dir">${dirPath}</span>` : ''}
        </span>
        ${ruleKey ? `<span class="event-rule">${ruleKey}</span>` : ''}
      </div>
    </div>
  </div>`;
}

function renderEmptyState(): string {
  return `<div class="empty-state">
    <p>No remediation events yet.</p>
    <p class="empty-state-hint">Events will appear here when you open issues, hotspots, or fix suggestions from SonarQube/SonarCloud.</p>
  </div>`;
}

function formatTimeAgo(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  // Format time as HH:MM AM/PM
  const timeString = date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  // If today, just show time; otherwise show date and time
  if (isToday) {
    return timeString;
  } else {
    const dateString = date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric'
    });
    return `${dateString}, ${timeString}`;
  }
}

function getEventTypeLabel(type: RemediationEventType): string {
  switch (type) {
    case RemediationEventType.OPEN_ISSUE:
      return 'Issue';
    case RemediationEventType.OPEN_HOTSPOT:
      return 'Hotspot';
    case RemediationEventType.VIEW_FIX_SUGGESTION:
      return 'Fix Suggestion';
    default:
      return 'Event';
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
