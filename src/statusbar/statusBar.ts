/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as VSCode from 'vscode';
import { Commands } from '../util/commands';

export class StatusBarService {
  private static _instance: StatusBarService;
  private readonly statusBarItem: VSCode.StatusBarItem;
  private referenceBranchName: string | null = null;
  private focusOnNewCode: boolean = false;
  private automaticAnalysisEnabled: boolean = true;
  private flightRecorderSessionId: string | null = null;

  private constructor(context: VSCode.ExtensionContext) {
    this.statusBarItem = VSCode.window.createStatusBarItem(VSCode.StatusBarAlignment.Left, 0);
    this.statusBarItem.command = Commands.SHOW_STATUS_BAR_MENU;
    context.subscriptions.push(this.statusBarItem);
    this.updateStatusBarText();
    this.statusBarItem.show();
  }

  static init(context: VSCode.ExtensionContext): void {
    StatusBarService._instance = new StatusBarService(context);
  }

  static get instance(): StatusBarService {
    return StatusBarService._instance;
  }

  updateReferenceBranch(branchName: string | null): void {
    this.referenceBranchName = branchName;
    this.updateStatusBarText();
  }

  updateFocusOnNewCode(enabled: boolean): void {
    this.focusOnNewCode = enabled;
    this.updateStatusBarText();
  }

  updateAutomaticAnalysis(enabled: boolean): void {
    this.automaticAnalysisEnabled = enabled;
    this.updateStatusBarText();
  }

  updateFlightRecorder(sessionId: string | null): void {
    this.flightRecorderSessionId = sessionId;
    this.updateStatusBarText();
  }

  private updateStatusBarText(): void {
    const parts: string[] = [];

    // Add focus state
    const focusText = this.focusOnNewCode ? 'new code' : 'overall code';
    parts.push(`focus on ${focusText}`);

    // Add branch if available
    if (this.referenceBranchName) {
      parts.push(`branch ${this.referenceBranchName}`);
    }

    // Build final text
    if (parts.length > 0) {
      this.statusBarItem.text = `SonarQube (${parts.join(', ')})`;
    } else {
      this.statusBarItem.text = 'SonarQube';
    }

    // Update tooltip
    this.updateStatusBarTooltip();
  }

  private updateStatusBarTooltip(): void {
    const tooltipParts: string[] = [];

    tooltipParts.push(`Focus: ${this.focusOnNewCode ? 'New code' : 'Overall code'}`);
    tooltipParts.push(`Automatic analysis: ${this.automaticAnalysisEnabled ? 'Enabled' : 'Disabled'}`);

    if (this.referenceBranchName) {
      tooltipParts.push(`Branch: ${this.referenceBranchName}`);
    }

    if (this.flightRecorderSessionId) {
      tooltipParts.push(`Flight Recorder: Active (session ${this.flightRecorderSessionId})`);
    }

    tooltipParts.push('\nClick to open menu');

    this.statusBarItem.tooltip = tooltipParts.join('\n');
  }

  async showQuickPickMenu(): Promise<void> {
    const items: VSCode.QuickPickItem[] = [];

    const focusIcon = this.focusOnNewCode ? '$(eye)' : '$(eye-closed)';
    const focusLabel = this.focusOnNewCode ? 'Focus on overall code' : 'Focus on new code';
    items.push({
      label: `${focusIcon} ${focusLabel}`,
      detail: this.focusOnNewCode
        ? 'Switch to showing all issues'
        : 'Switch to showing only issues in new code',
      alwaysShow: true
    });

    const analysisIcon = this.automaticAnalysisEnabled ? '$(circle-filled)' : '$(circle-outline)';
    const analysisLabel = this.automaticAnalysisEnabled ? 'Disable automatic analysis' : 'Enable automatic analysis';
    items.push({
      label: `${analysisIcon} ${analysisLabel}`,
      detail: this.automaticAnalysisEnabled
        ? 'Stop analyzing files automatically'
        : 'Start analyzing files automatically',
      alwaysShow: true
    });

    if (this.flightRecorderSessionId) {
      items.push({
        label: 'Flight Recorder',
        kind: VSCode.QuickPickItemKind.Separator
      });

      items.push({
        label: '$(clippy) Copy Flight Recording Session ID',
        detail: 'Copy current flight recording session ID to system clipboard',
        alwaysShow: true
      });

      items.push({
        label: '$(debug-line-by-line) Dump Backend Threads',
        detail: 'Capture a dump of the language server JVM threads',
        alwaysShow: true
      });
    }

    const selectedItem = await VSCode.window.showQuickPick(items, {
      title: 'SonarQube',
      placeHolder: 'Select an action'
    });

    if (selectedItem) {
      await this.handleQuickPickSelection(selectedItem);
    }
  }

  private async handleQuickPickSelection(item: VSCode.QuickPickItem): Promise<void> {
    if (item.label.includes('Focus on')) {
      // Toggle focus on new code
      await VSCode.commands.executeCommand(Commands.NEW_CODE_DEFINITION);
    } else if (item.label.includes('automatic analysis')) {
      // Toggle automatic analysis
      const command = this.automaticAnalysisEnabled
        ? 'SonarLint.AutomaticAnalysis.Disable'
        : 'SonarLint.AutomaticAnalysis.Enable';
      await VSCode.commands.executeCommand(command);
    } else if (item.label.includes('Copy Flight Recording')) {
      // Copy flight recorder session ID
      await VSCode.commands.executeCommand(Commands.COPY_FLIGHT_RECORDER_SESSION_ID);
    } else if (item.label.includes('Dump Backend Threads')) {
      // Dump backend threads
      await VSCode.commands.executeCommand(Commands.DUMP_BACKEND_THREADS);
    }
  }
}
