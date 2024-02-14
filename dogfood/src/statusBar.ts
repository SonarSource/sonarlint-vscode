/* --------------------------------------------------------------------------------------------
 * SonarLint Dogfood
 * Copyright (C) 2021-2024 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as vscode from 'vscode'
import { Status } from './status';

export class StatusBar {
	private status: Status;
	private lastCheck?: Date;
  
	constructor(private readonly statusBarItem: vscode.StatusBarItem) {
	  this.status = Status.UNKNOWN;
	  this.refreshStatus();
	}
  
	setStatus(status: Status) {
	  this.status = status;
	  if (status === Status.IDLE) {
		this.lastCheck = new Date();
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