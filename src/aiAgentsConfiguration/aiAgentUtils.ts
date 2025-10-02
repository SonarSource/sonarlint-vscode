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

export const COPILOT_EXTENSION_ID = 'GitHub.copilot';

const COPILOT_POLLING_INTERVAL = 200; // 200ms
const COPILOT_MAX_WAIT_TIME = 10000; // 10 seconds max

export function isCopilotInstalledAndActive(): Promise<boolean> {
  return new Promise((resolve) => {
    const copilotExtension = vscode.extensions.getExtension(COPILOT_EXTENSION_ID);
    
    if (!copilotExtension) {
      resolve(false);
      return;
    }
    
    let attempts = 0;
    const maxAttempts = COPILOT_MAX_WAIT_TIME / COPILOT_POLLING_INTERVAL; // 50 attempts
    
    const poll = () => {
      attempts++;
      const isActive = copilotExtension.isActive;
      if (isActive || attempts >= maxAttempts) {
        resolve(isActive);
      } else {
        setTimeout(poll, COPILOT_POLLING_INTERVAL);
      }
    };
    poll();
  });
}

export async function getCurrentIdeWithMCPSupport(): Promise<IDE | undefined> {
  if (vscode.env.appName.toLowerCase().includes('cursor')) {
    return IDE.CURSOR;
  } else if (vscode.env.appName.toLowerCase().includes('windsurf')) {
    return IDE.WINDSURF;
  } else if (vscode.env.appName.toLowerCase().includes('insiders')) {
    // Wait for Copilot activation for VS Code Insiders
    const isCopilotActive = await isCopilotInstalledAndActive();
    return isCopilotActive ? IDE.VSCODE_INSIDERS : undefined;
  } else if (vscode.env.appName.toLowerCase().includes('visual studio code')) {
    // Wait for Copilot activation for VS Code
    const isCopilotActive = await isCopilotInstalledAndActive();
    return isCopilotActive ? IDE.VSCODE : undefined;
  }
  return undefined;
}
