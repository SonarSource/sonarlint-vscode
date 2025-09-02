/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import { ContextManager } from '../contextManager';
import { Commands } from '../util/commands';

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

  private readonly flightRecorderStatusItem: vscode.StatusBarItem;
  sessionId?: string;

  constructor() {
    this.flightRecorderStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, FLIGHT_RECORDER_ITEM_PRIORITY);
    this.flightRecorderStatusItem.text = '$(record) SonarQube Flight Recorder';
    this.flightRecorderStatusItem.command = Commands.SHOW_FLIGHT_RECORDING_MENU;
  }

  static get instance() {
    if (!FlightRecorderService._instance) {
      FlightRecorderService._instance = new FlightRecorderService();
    }
    return FlightRecorderService._instance;
  }

  async onFlightRecorderStarted(sessionId: string) {
    this.sessionId = sessionId;
    ContextManager.instance.setFlightRecorderRunningContext();
    this.flightRecorderStatusItem.tooltip = `SonarQube Flight Recorder session '${this.sessionId}' running.
Click to copy session ID or capture a thread dump.`;
    this.flightRecorderStatusItem.show();

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
