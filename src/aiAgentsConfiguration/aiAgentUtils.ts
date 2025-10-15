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
  return undefined;
}
