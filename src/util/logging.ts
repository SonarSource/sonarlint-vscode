/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as VSCode from 'vscode';

let sonarlintOutput: VSCode.OutputChannel;

export function initLogOutput(context: VSCode.ExtensionContext) {
  sonarlintOutput = VSCode.window.createOutputChannel('SonarLint');
  context.subscriptions.push(sonarlintOutput);
}

export function getLogOutput() {
  return sonarlintOutput;
}

export function logToSonarLintOutput(message) {
  if (sonarlintOutput) {
    sonarlintOutput.appendLine(message);
  }
}

export function showLogOutput() {
  getLogOutput()?.show();
}
