/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { ExtendedClient } from '../lsp/protocol';

export enum RemediationEventType {
  OPEN_ISSUE = 'openIssue',
  OPEN_HOTSPOT = 'openHotspot',
  VIEW_FIX_SUGGESTION = 'viewFixSuggestion'
}

export interface BaseRemediationEvent {
  id: string;
  type: RemediationEventType;
  timestamp: number;
  fileUri: string;
  message: string;
  ruleKey?: string;
}

export interface IssueRemediationEvent extends BaseRemediationEvent {
  type: RemediationEventType.OPEN_ISSUE;
  issue: ExtendedClient.Issue;
  textRange: ExtendedClient.TextRange;
}

export interface HotspotRemediationEvent extends BaseRemediationEvent {
  type: RemediationEventType.OPEN_HOTSPOT;
  hotspot: ExtendedClient.RemoteHotspot;
  textRange: ExtendedClient.TextRange;
}

export interface FixSuggestionRemediationEvent extends BaseRemediationEvent {
  type: RemediationEventType.VIEW_FIX_SUGGESTION;
  params: ExtendedClient.ShowFixSuggestionParams;
}

export type RemediationEvent = IssueRemediationEvent | HotspotRemediationEvent | FixSuggestionRemediationEvent;
