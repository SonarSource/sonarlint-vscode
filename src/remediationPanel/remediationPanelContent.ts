/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { RemediationEvent, RemediationEventType } from './remediationEvent';
import { ResourceResolver } from '../util/webview';

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
  const icon = getEventIcon(event.type, resolver);
  const typeLabel = getEventTypeLabel(event.type);
  const timeAgo = formatTimeAgo(event.timestamp);
  const message = escapeHtml(event.message);
  const filePath = escapeHtml(event.filePath);
  const ruleKey = event.ruleKey ? escapeHtml(event.ruleKey) : '';

  return `<div class="event-item" data-event-id="${event.id}">
    <div class="event-icon">
      <img src="${icon}" alt="${typeLabel}">
    </div>
    <div class="event-details">
      <div class="event-header">
        <span class="event-type">${typeLabel}</span>
        <span class="event-time">${timeAgo}</span>
      </div>
      <div class="event-message">${message}</div>
      <div class="event-metadata">
        <span class="event-file">${filePath}</span>
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
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return 'just now';
  } else if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  } else {
    return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  }
}

function getEventIcon(type: RemediationEventType, resolver: ResourceResolver): string {
  switch (type) {
    case RemediationEventType.OPEN_ISSUE:
      return resolver.resolve('images', 'type', 'bug.svg');
    case RemediationEventType.OPEN_HOTSPOT:
      return resolver.resolve('images', 'type', 'security_hotspot.svg');
    case RemediationEventType.VIEW_FIX_SUGGESTION:
      return resolver.resolve('images', 'labs', 'ide_labs.svg');
    default:
      return resolver.resolve('images', 'type', 'bug.svg');
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
