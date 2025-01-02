/* --------------------------------------------------------------------------------------------
 * SonarLint Dogfood
 * Copyright (C) 2021-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as vscode from 'vscode'
import { Status } from './status';
import { COMMAND_AUTHENTICATE, COMMAND_CHECK_NOW } from './constants';

export class StatusBar {
  private status: Status = Status.UNKNOWN;
  private lastCheck?: Date;

  constructor(private readonly statusBarItem: vscode.StatusBarItem) {
    this.setStatus(Status.UNKNOWN);
  }

  setStatus(status: Status) {
    this.status = status;
    this.statusBarItem.command = COMMAND_CHECK_NOW;
    if (status === Status.IDLE) {
      this.lastCheck = new Date();
    } else if (status === Status.UNAUTHENTICATED) {
      this.statusBarItem.command = COMMAND_AUTHENTICATE;
    }
    this.refreshStatus();
  }

  private refreshStatus() {
    this.statusBarItem.text = this.status.text;
    this.statusBarItem.tooltip = `SonarLint Dogfood: ${this.status.tooltip}`;
    if (this.lastCheck) {
      this.statusBarItem.tooltip += `\nLast checked: ${this.lastCheck}`;
    }
    this.statusBarItem.show();
  }
}