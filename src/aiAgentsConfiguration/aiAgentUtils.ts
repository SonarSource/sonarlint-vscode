/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) SonarSource Sàrl
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

// Windsurf was rebranded to Devin; both share the same configuration layout under ~/.codeium
function isWindsurfBasedIde(appName: string): boolean {
  return appName.includes('windsurf') || appName.includes('devin');
}

export function getCurrentAgentWithMCPSupport(): AGENT | undefined {
  const appName = vscode.env.appName.toLowerCase();
  if (appName.includes('cursor')) {
    return AGENT.CURSOR;
  } else if (isWindsurfBasedIde(appName)) {
    return AGENT.WINDSURF;
  } else if (appName.includes('kiro')) {
    return AGENT.KIRO;
  } else if (appName.includes('visual studio code') && isCopilotInstalledAndActive()) {
    return AGENT.GITHUB_COPILOT;
  }
  return undefined;
}

export function getCurrentAgentWithHookSupport(): AGENT | undefined {
  const appName = vscode.env.appName.toLowerCase();
  // Hooks are available on all Windsurf / Devin versions
  if (isWindsurfBasedIde(appName)) {
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
