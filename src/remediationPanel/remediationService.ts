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

const BATCH_THRESHOLD_MS = 5000;

export class RemediationService {
  private static _instance: RemediationService;
  private events: RemediationEvent[] = [];
  private lastEventTimestamp: number = 0;
  private eventChangeEmitter = new vscode.EventEmitter<RemediationEvent[]>();
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
    this.checkAndClearBatch();

    const fileUri = issue.fileUri;
    const filePath = this.getRelativePath(fileUri);
    const textRange = issue.textRange;

    const event: IssueRemediationEvent = {
      id: this.generateId(),
      type: RemediationEventType.OPEN_ISSUE,
      timestamp: Date.now(),
      fileUri,
      filePath,
      message: issue.message,
      ruleKey: issue.ruleKey,
      issue,
      textRange
    };

    this.addEvent(event);
  }

  trackHotspotEvent(hotspot: ExtendedClient.RemoteHotspot): void {
    this.checkAndClearBatch();

    const fileUri = `file://${hotspot.ideFilePath}`;
    const filePath = this.getRelativePath(fileUri);
    const textRange = hotspot.textRange;

    const event: HotspotRemediationEvent = {
      id: this.generateId(),
      type: RemediationEventType.OPEN_HOTSPOT,
      timestamp: Date.now(),
      fileUri,
      filePath,
      message: hotspot.message,
      ruleKey: hotspot.rule?.key,
      hotspot,
      textRange
    };

    this.addEvent(event);
  }

  trackFixSuggestionEvent(params: ExtendedClient.ShowFixSuggestionParams): void {
    this.checkAndClearBatch();

    const fileUri = params.fileUri;
    const filePath = this.getRelativePath(fileUri);

    const event: FixSuggestionRemediationEvent = {
      id: this.generateId(),
      type: RemediationEventType.VIEW_FIX_SUGGESTION,
      timestamp: Date.now(),
      fileUri,
      filePath,
      message: 'AI-generated fix suggestion',
      params
    };

    this.addEvent(event);
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  clearEvents(): void {
    this.events = [];
    this.lastEventTimestamp = 0;
    this.eventChangeEmitter.fire(this.events);
  }

  getEvents(): ReadonlyArray<RemediationEvent> {
    return this.events;
  }

  private checkAndClearBatch(): void {
    const now = Date.now();
    if (this.events.length > 0 && now - this.lastEventTimestamp > BATCH_THRESHOLD_MS) {
      this.events = [];
    }
  }

  private addEvent(event: RemediationEvent): void {
    this.events.push(event);
    this.lastEventTimestamp = event.timestamp;
    this.eventChangeEmitter.fire(this.events);
  }

  private getRelativePath(fileUri: string): string {
    try {
      const uri = vscode.Uri.parse(fileUri);
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
      if (workspaceFolder) {
        return vscode.workspace.asRelativePath(uri, false);
      }
      return uri.fsPath;
    } catch (error) {
      return fileUri;
    }
  }

  dispose(): void {
    this.eventChangeEmitter.dispose();
  }
}
