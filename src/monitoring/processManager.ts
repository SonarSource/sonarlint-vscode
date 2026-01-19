/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { ChildProcess } from 'node:child_process';

export class ProcessManager {
  private static _instance: ProcessManager;
  private languageServerProcess: ChildProcess | null = null;

  private constructor() {}

  static get instance(): ProcessManager {
    if (!ProcessManager._instance) {
      ProcessManager._instance = new ProcessManager();
    }
    return ProcessManager._instance;
  }

  setLanguageServerProcess(process: ChildProcess): void {
    this.languageServerProcess = process;

    process.on('exit', () => {
      this.languageServerProcess = null;
    });
  }

  getLanguageServerPid(): number | undefined {
    return this.languageServerProcess?.pid;
  }
}
