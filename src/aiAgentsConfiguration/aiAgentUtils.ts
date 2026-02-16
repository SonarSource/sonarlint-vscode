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
  WINDSURF = 'windsurf',
  KIRO = 'kiro'
}

function isCopilotInstalledAndActive(): boolean {
  const copilotExtension = vscode.extensions.getExtension('github.copilot-chat');
  return copilotExtension?.isActive;
}

export function getCurrentAgentWithMCPSupport(): AGENT | undefined {
  if (vscode.env.appName.toLowerCase().includes('cursor')) {
    return AGENT.CURSOR;
  } else if (vscode.env.appName.toLowerCase().includes('windsurf')) {
    return AGENT.WINDSURF;
  } else if (vscode.env.appName.toLowerCase().includes('kiro')) {
    return AGENT.KIRO;
  } else if (vscode.env.appName.toLowerCase().includes('visual studio code') && isCopilotInstalledAndActive()) {
    return AGENT.GITHUB_COPILOT;
  }
  return undefined;
}

export function getCurrentAgentWithHookSupport(): AGENT | undefined {
  const appName = vscode.env.appName.toLowerCase();
  // Hooks are available on all Windsurf versions
  if (appName.includes('windsurf')) {
    return AGENT.WINDSURF;
  }
  return undefined;
}

export function getWindsurfDirectory(): string {
  const appName = vscode.env.appName.toLowerCase();
  if (appName.includes('next')) {
    return 'windsurf-next';
  }
  return 'windsurf';
}
