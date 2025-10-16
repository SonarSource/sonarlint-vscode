/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';

export enum IDE {
  VSCODE = 'vscode',
  CURSOR = 'cursor',
  WINDSURF = 'windsurf',
  VSCODE_INSIDERS = 'vscode-insiders'
}

function isCopilotInstalledAndActive(): boolean {
  const copilotExtension = vscode.extensions.getExtension('GitHub.copilot');
  return copilotExtension?.isActive;
}

export function getCurrentIdeWithMCPSupport(): IDE | undefined {
  if (vscode.env.appName.toLowerCase().includes('cursor')) {
    return IDE.CURSOR;
  } else if (vscode.env.appName.toLowerCase().includes('windsurf')) {
    return IDE.WINDSURF;
  } else if (vscode.env.appName.toLowerCase().includes('insiders') && isCopilotInstalledAndActive()) {
    return IDE.VSCODE_INSIDERS;
  } else if (vscode.env.appName.toLowerCase().includes('visual studio code') && isCopilotInstalledAndActive()) {
    return IDE.VSCODE;
  }
  return undefined;
}
