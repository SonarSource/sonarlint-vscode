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
  private focusOnNewCode = false;
  private flightRecorderStarted = false;
  private automaticAnalysisEnabled = true;

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

  updateFlightRecorder(started: boolean): void {
    this.flightRecorderStarted = started;
    this.updateStatusBarText();
  }

  private updateStatusBarText(): void {
    const icon = this.automaticAnalysisEnabled ? '$(circle-filled)' : '$(circle-outline)';
    this.statusBarItem.text = `${icon} SonarQube`;
    this.updateStatusBarTooltip();
  }

  private updateStatusBarTooltip(): void {
    const tooltipParts: string[] = [];

    tooltipParts.push(
      `Focus: ${this.focusOnNewCode ? 'New code' : 'Overall code'}`,
      `Automatic analysis: ${this.automaticAnalysisEnabled ? 'Enabled' : 'Disabled'}`
    );

    if (this.referenceBranchName) {
      tooltipParts.push(`Branch: ${this.referenceBranchName}`);
    }

    tooltipParts.push('\nClick to open menu');

    this.statusBarItem.tooltip = tooltipParts.join('\n');
  }

  async showQuickPickMenu(): Promise<void> {
    const items: VSCode.QuickPickItem[] = [];

    const focusIcon = this.focusOnNewCode ? '$(eye-closed)' : '$(eye)';
    const focusLabel = this.focusOnNewCode ? 'Focus on overall code' : 'Focus on new code';
    items.push({
      label: `${focusIcon} ${focusLabel}`,
      detail: this.focusOnNewCode
        ? 'Switch to showing all issues'
        : 'Switch to showing only issues in new code',
      alwaysShow: true
    });

    const analysisIcon = this.automaticAnalysisEnabled ? '$(circle-outline)' : '$(circle-filled)';
    const analysisLabel = this.automaticAnalysisEnabled ? 'Disable automatic analysis' : 'Enable automatic analysis';
    items.push({
      label: `${analysisIcon} ${analysisLabel}`,
      detail: this.automaticAnalysisEnabled
        ? 'Stop analyzing files automatically'
        : 'Start analyzing files automatically',
      alwaysShow: true
    },
    {
      label: 'Flight Recorder',
      kind: VSCode.QuickPickItemKind.Separator
    });

    if (this.flightRecorderStarted) {
      items.push({
        label: '$(debug-stop) Stop Flight Recorder',
        detail: 'Stop recording and create diagnostic archive',
        alwaysShow: true
      },
      {
        label: '$(debug-line-by-line) Capture Thread Dump',
        detail: 'Capture current thread dump using jstack',
        alwaysShow: true
      },
      {
        label: '$(database) Capture Heap Dump',
        detail: 'Capture heap dump using jcmd (may be large)',
        alwaysShow: true
      });
    } else {
      items.push({
        label: '$(record) Start Flight Recorder',
        detail: 'Start capturing diagnostic data locally',
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
    } else if (item.label.includes('Start Flight Recorder')) {
      // Start flight recorder
      await VSCode.commands.executeCommand(Commands.START_FLIGHT_RECORDER);
    } else if (item.label.includes('Stop Flight Recorder')) {
      // Stop flight recorder
      await VSCode.commands.executeCommand(Commands.STOP_FLIGHT_RECORDER);
    } else if (item.label.includes('Capture Thread Dump')) {
      // Capture thread dump
      await VSCode.commands.executeCommand(Commands.DUMP_BACKEND_THREADS);
    } else if (item.label.includes('Capture Heap Dump')) {
      // Capture heap dump
      await VSCode.commands.executeCommand(Commands.CAPTURE_HEAP_DUMP);
    }
  }
}
