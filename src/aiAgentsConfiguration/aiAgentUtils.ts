/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';

export enum INTEGRATION_TARGET {
  GITHUB_COPILOT = 'github_copilot',
  CURSOR = 'cursor',
  WINDSURF = 'windsurf',
  KIRO = 'kiro',
  CLAUDE_CODE = 'claude_code',
  CODEX = 'codex'
}

export enum IDE_HOST {
  VS_CODE = 'vscode',
  CURSOR = 'cursor',
  WINDSURF = 'windsurf',
  KIRO = 'kiro',
  OTHER = 'other'
}

export interface DetectedIdeAgent {
  id: INTEGRATION_TARGET;
  name: string;
  source: 'builtIn' | 'extension';
}

interface CurrentIdeHost {
  id: IDE_HOST;
  name: string;
}

const CLAUDE_CODE_EXTENSION_IDS = ['anthropic.claude-code'];
const CODEX_EXTENSION_IDS = ['openai.chatgpt'];

function isCopilotInstalledAndActive(): boolean {
  const copilotExtension = vscode.extensions.getExtension('github.copilot-chat');
  return copilotExtension?.isActive === true;
}

function isAnyExtensionInstalled(extensionIds: string[]): boolean {
  return extensionIds.some(extensionId => vscode.extensions.getExtension(extensionId) !== undefined);
}

export function getCurrentIdeHost(): CurrentIdeHost {
  const appName = vscode.env.appName.toLowerCase();
  if (appName.includes('cursor')) {
    return { id: IDE_HOST.CURSOR, name: 'Cursor' };
  }
  if (appName.includes('windsurf')) {
    return { id: IDE_HOST.WINDSURF, name: 'Windsurf' };
  }
  if (appName.includes('kiro')) {
    return { id: IDE_HOST.KIRO, name: 'Kiro' };
  }
  if (appName.includes('visual studio code')) {
    return { id: IDE_HOST.VS_CODE, name: 'VS Code' };
  }
  return { id: IDE_HOST.OTHER, name: vscode.env.appName };
}

/**
 * Returns agents available in the IDE hosting this extension. In particular,
 * built-in agents from another IDE are never inferred from machine-level files.
 */
export function getDetectedIdeAgents(): DetectedIdeAgent[] {
  const currentIdeHost = getCurrentIdeHost();
  const agents: DetectedIdeAgent[] = [];

  if (currentIdeHost.id === IDE_HOST.CURSOR) {
    agents.push({
      id: INTEGRATION_TARGET.CURSOR,
      name: 'Cursor',
      source: 'builtIn'
    });
  } else if (currentIdeHost.id === IDE_HOST.WINDSURF) {
    agents.push({
      id: INTEGRATION_TARGET.WINDSURF,
      name: 'Windsurf',
      source: 'builtIn'
    });
  } else if (currentIdeHost.id === IDE_HOST.KIRO) {
    agents.push({
      id: INTEGRATION_TARGET.KIRO,
      name: 'Kiro',
      source: 'builtIn'
    });
  } else if (currentIdeHost.id === IDE_HOST.VS_CODE && vscode.extensions.getExtension('github.copilot-chat')) {
    agents.push({
      id: INTEGRATION_TARGET.GITHUB_COPILOT,
      name: 'Copilot in VS Code',
      source: 'extension'
    });
  }

  if (isAnyExtensionInstalled(CLAUDE_CODE_EXTENSION_IDS)) {
    agents.push({
      id: INTEGRATION_TARGET.CLAUDE_CODE,
      name: 'Claude Code',
      source: 'extension'
    });
  }
  if (isAnyExtensionInstalled(CODEX_EXTENSION_IDS)) {
    agents.push({
      id: INTEGRATION_TARGET.CODEX,
      name: 'Codex',
      source: 'extension'
    });
  }

  return agents;
}

export function getCurrentIntegrationTargetWithMCPSupport(): INTEGRATION_TARGET | undefined {
  if (vscode.env.appName.toLowerCase().includes('cursor')) {
    return INTEGRATION_TARGET.CURSOR;
  } else if (vscode.env.appName.toLowerCase().includes('windsurf')) {
    return INTEGRATION_TARGET.WINDSURF;
  } else if (vscode.env.appName.toLowerCase().includes('kiro')) {
    return INTEGRATION_TARGET.KIRO;
  } else if (vscode.env.appName.toLowerCase().includes('visual studio code') && isCopilotInstalledAndActive()) {
    return INTEGRATION_TARGET.GITHUB_COPILOT;
  }
  return undefined;
}

export function getCurrentIntegrationTargetWithHookSupport(): INTEGRATION_TARGET | undefined {
  const appName = vscode.env.appName.toLowerCase();
  // Hooks are available on all Windsurf versions
  if (appName.includes('windsurf')) {
    return INTEGRATION_TARGET.WINDSURF;
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
