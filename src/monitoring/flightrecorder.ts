/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import { ContextManager } from '../contextManager';
import { Commands } from '../util/commands';
import { StatusBarService } from '../statusbar/statusBar';

const FLIGHT_RECORDER_ITEM_PRIORITY = 3;

const copyFlightRecorderSessionId = {
  iconPath: new vscode.ThemeIcon('clippy'),
  label: 'Copy Flight Recording Session ID',
  detail: 'Copy current flight recording session ID to system clipboard',
  command: Commands.COPY_FLIGHT_RECORDER_SESSION_ID
};

const dumpBackendThreads = {
  iconPath: new vscode.ThemeIcon('debug-line-by-line'),
  label: 'Dump Backend Threads',
  detail: 'Capture a dump of the language server JVM threads',
  command: Commands.DUMP_BACKEND_THREADS
};

export class FlightRecorderService {
  private static _instance: FlightRecorderService;

  sessionId?: string;

  static get instance() {
    if (!FlightRecorderService._instance) {
      FlightRecorderService._instance = new FlightRecorderService();
    }
    return FlightRecorderService._instance;
  }

  async onFlightRecorderStarted(sessionId: string) {
    this.sessionId = sessionId;
    ContextManager.instance.setFlightRecorderRunningContext();
    StatusBarService.instance.updateFlightRecorder(sessionId);

    vscode.window.showInformationMessage(`SonarQube Flight Recorder started with session ID '${this.sessionId}'.`, 'Copy Session ID')
      .then(copySelected => {
        if (copySelected) {
          vscode.commands.executeCommand(Commands.COPY_FLIGHT_RECORDER_SESSION_ID);
        }
      });
  }

  async showFlightRecordingMenu() {
    const selectedItem = await vscode.window.showQuickPick([
      copyFlightRecorderSessionId,
      dumpBackendThreads
    ], { title: 'SonarQube Flight Recorder' });
    if (selectedItem) {
      vscode.commands.executeCommand(selectedItem.command);
    }
  }

  async copySessionIdToClipboard() {
    await vscode.env.clipboard.writeText(this.sessionId);
    vscode.window.showInformationMessage(`Flight recording session ID '${this.sessionId}' copied to system clipboard.`);
  }
}
