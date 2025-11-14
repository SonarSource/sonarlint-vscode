/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';

export enum AGENT {
  GITHUB_COPILOT = 'github_copilot',
  CURSOR = 'cursor',
  WINDSURF = 'windsurf'
}

function isCopilotInstalledAndActive(): boolean {
  const copilotExtension = vscode.extensions.getExtension('GitHub.copilot');
  return copilotExtension?.isActive;
}

export function getCurrentAgentWithMCPSupport(): AGENT | undefined {
  if (vscode.env.appName.toLowerCase().includes('cursor')) {
    return AGENT.CURSOR;
  } else if (vscode.env.appName.toLowerCase().includes('windsurf')) {
    return AGENT.WINDSURF;
  } else if (vscode.env.appName.toLowerCase().includes('visual studio code') && isCopilotInstalledAndActive()) {
    return AGENT.GITHUB_COPILOT;
  }
  return undefined;
}
