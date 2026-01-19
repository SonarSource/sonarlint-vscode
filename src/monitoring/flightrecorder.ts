/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import * as path from 'node:path';
import { ContextManager } from '../contextManager';
import { StatusBarService } from '../statusbar/statusBar';
import { ProcessManager } from './processManager';
import { captureThreadDump, captureHeapDump } from './diagnosticsExecutor';
import {
  createRecordingFolder,
  getRecordingDiagnosticsPath,
} from './recordingStorage';
import { createRecordingArchive } from './archiver';

export class FlightRecorderService {
  private static _instance: FlightRecorderService;

  private isRecording = false;
  private recordingFolder: string | null = null;
  private javaHome: string | null = null;

  static get instance() {
    if (!FlightRecorderService._instance) {
      FlightRecorderService._instance = new FlightRecorderService();
    }
    return FlightRecorderService._instance;
  }

  async startRecording(javaHome: string): Promise<void> {
    if (this.isRecording) {
      vscode.window.showWarningMessage('SonarQube Flight Recorder is already running.');
      return;
    }

    try {
      this.javaHome = javaHome;

      this.recordingFolder = await createRecordingFolder();

      this.isRecording = true;

      ContextManager.instance.setFlightRecorderRunningContext();
      StatusBarService.instance.updateFlightRecorder(true);

      vscode.window.showInformationMessage('SonarQube Flight Recorder started');
    } catch (error) {
      this.resetState();
      vscode.window.showErrorMessage(`Failed to start SonarQube Flight Recorder: ${error.message}`);
      throw error;
    }
  }

  async captureThreadDump(): Promise<void> {
    if (!this.isRecording) {
      vscode.window.showErrorMessage('SonarQube Flight Recorder is not running. Start recording first.');
      return;
    }

    const pid = ProcessManager.instance.getLanguageServerPid();
    if (!pid) {
      vscode.window.showErrorMessage('Cannot capture thread dump: Language server is not running.');
      return;
    }

    try {
      const timestamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
      const diagnosticsPath = getRecordingDiagnosticsPath(this.recordingFolder);
      const outputPath = path.join(diagnosticsPath, `thread-dump-${timestamp}.txt`);

      await captureThreadDump(this.javaHome, pid, outputPath);

      vscode.window.showInformationMessage('Thread dump captured successfully.');
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to capture thread dump: ${error.message}`);
    }
  }

  async captureHeapDump(): Promise<void> {
    if (!this.isRecording) {
      vscode.window.showErrorMessage('SonarQube Flight Recorder is not running. Start recording first.');
      return;
    }

    const pid = ProcessManager.instance.getLanguageServerPid();
    if (!pid) {
      vscode.window.showErrorMessage('Cannot capture heap dump: Language server is not running.');
      return;
    }

    try {
      const timestamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
      const diagnosticsPath = getRecordingDiagnosticsPath(this.recordingFolder);
      const outputPath = path.join(diagnosticsPath, `heap-dump-${timestamp}.hprof`);

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Capturing heap dump...',
          cancellable: false
        },
        async () => {
          await captureHeapDump(this.javaHome, pid, outputPath);
        }
      );

      vscode.window.showInformationMessage('Heap dump captured successfully.');
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to capture heap dump: ${error.message}`);
    }
  }

  async stopRecording(): Promise<void> {
    if (!this.isRecording) {
      vscode.window.showWarningMessage('SonarQube Flight Recorder is not running.');
      return;
    }

    try {
      const zipPath = await createRecordingArchive(this.recordingFolder);

      ContextManager.instance.clearFlightRecorderRunningContext();
      StatusBarService.instance.updateFlightRecorder(false);

      const zipUri = vscode.Uri.file(zipPath);
      await vscode.commands.executeCommand('revealFileInOS', zipUri);

      vscode.window.showInformationMessage(`SonarQube Flight Recorder stopped. Recording saved to ${zipPath}`);

      this.resetState();
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to stop Flight Recorder: ${error.message}`);
      // Still reset state even if stopping failed
      this.resetState();
    }
  }

  private resetState(): void {
    this.isRecording = false;
    this.recordingFolder = null;
    this.javaHome = null;
  }

  get recording(): boolean {
    return this.isRecording;
  }
}
