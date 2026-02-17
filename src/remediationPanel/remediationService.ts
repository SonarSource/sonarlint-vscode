/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import { ExtendedClient } from '../lsp/protocol';
import {
  RemediationEvent,
  RemediationEventType,
  IssueRemediationEvent,
  HotspotRemediationEvent,
  FixSuggestionRemediationEvent
} from './remediationEvent';

export class RemediationService {
  private static _instance: RemediationService;
  private readonly viewedEventIds: Set<string> = new Set();
  private readonly eventChangeEmitter = new vscode.EventEmitter<RemediationEvent[]>();
  private events: RemediationEvent[] = [];
  private eventIdCounter = 0;
  public readonly onEventsChanged = this.eventChangeEmitter.event;

  private constructor() {}

  static init(): void {
    if (!RemediationService._instance) {
      RemediationService._instance = new RemediationService();
    }
  }

  static get instance(): RemediationService {
    if (!RemediationService._instance) {
      throw new Error('RemediationService not initialized. Call RemediationService.init() first.');
    }
    return RemediationService._instance;
  }

  trackIssueEvent(issue: ExtendedClient.Issue): void {
    this.clearEvents();

    const { fileUri, textRange } = issue;

    this.eventIdCounter++;
    const event: IssueRemediationEvent = {
      id: `${Date.now()}-${this.eventIdCounter}`,
      type: RemediationEventType.OPEN_ISSUE,
      timestamp: Date.now(),
      fileUri,
      message: issue.message,
      ruleKey: issue.ruleKey,
      issue,
      textRange
    };

    this.addEvent(event);
  }

  trackHotspotEvent(hotspot: ExtendedClient.RemoteHotspot): void {
    this.clearEvents();

    const fileUri = `file://${hotspot.ideFilePath}`;
    const textRange = hotspot.textRange;

    this.eventIdCounter++;
    const event: HotspotRemediationEvent = {
      id: `${Date.now()}-${this.eventIdCounter}`,
      type: RemediationEventType.OPEN_HOTSPOT,
      timestamp: Date.now(),
      fileUri,
      message: hotspot.message,
      ruleKey: hotspot.rule?.key,
      hotspot,
      textRange
    };

    this.addEvent(event);
  }

  trackFixSuggestionEvent(params: ExtendedClient.ShowFixSuggestionParams): void {
    this.clearEvents();

    const fileUri = params.fileUri;

    this.eventIdCounter++;
    const event: FixSuggestionRemediationEvent = {
      id: `${Date.now()}-${this.eventIdCounter}`,
      type: RemediationEventType.VIEW_FIX_SUGGESTION,
      timestamp: Date.now(),
      fileUri,
      message: params.explanation,
      params
    };

    this.addEvent(event);
  }

  clearEvents(): void {
    this.events = [];
    this.viewedEventIds.clear();
    this.eventChangeEmitter.fire(this.events);
  }

  getEvents(): ReadonlyArray<RemediationEvent> {
    return this.events;
  }

  markEventAsViewed(eventId: string): void {
    this.viewedEventIds.add(eventId);
    this.eventChangeEmitter.fire(this.events);
  }

  isEventViewed(eventId: string): boolean {
    return this.viewedEventIds.has(eventId);
  }

  private addEvent(event: RemediationEvent): void {
    this.events.push(event);
    this.eventChangeEmitter.fire(this.events);
  }

  dispose(): void {
    this.eventChangeEmitter.dispose();
  }
}
