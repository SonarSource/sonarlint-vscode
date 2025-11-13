/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SonarLintExtendedLanguageClient } from '../lsp/client';
import { Commands } from '../util/commands';
import { AGENT } from './aiAgentUtils';

interface HookConfig {
  command: string;
  show_output?: boolean;
  working_directory?: string;
}

interface HooksJson {
  hooks: {
    pre_read_code?: HookConfig[];
    post_write_code?: HookConfig[];
  };
}

export function getCurrentAgentWithHookSupport(): AGENT | undefined {
  if (vscode.env.appName.toLowerCase().includes('windsurf')) {
    return AGENT.WINDSURF;
  } else if (vscode.env.appName.toLowerCase().includes('cursor')) {
    return AGENT.CURSOR;
  }
  return undefined;
}

function getHooksConfigPath(agent: AGENT): string | undefined {
  switch (agent) {
    case AGENT.WINDSURF:
      // User-level hooks: ~/.codeium/windsurf/hooks.json
      const homeDir = process.env.HOME || process.env.USERPROFILE;
      if (!homeDir) return undefined;
      return path.join(homeDir, '.codeium', 'windsurf', 'hooks.json');
    case AGENT.CURSOR:
      // TODO: Update with actual Cursor hook configuration path once documented
      return undefined;
    default:
      return undefined;
  }
}

function getHookScriptDirectory(agent: AGENT): string | undefined {
  switch (agent) {
    case AGENT.WINDSURF:
      const homeDir = process.env.HOME || process.env.USERPROFILE;
      if (!homeDir) return undefined;
      return path.join(homeDir, '.codeium', 'windsurf', 'hooks');
    case AGENT.CURSOR:
      // TODO: Update with actual Cursor hook script path once documented
      return undefined;
    default:
      return undefined;
  }
}

async function readHooksConfig(configPath: string): Promise<HooksJson> {
  try {
    const content = await fs.promises.readFile(configPath, 'utf8');
    return JSON.parse(content);
  } catch {
    return { hooks: {} };
  }
}

async function writeHooksConfig(configPath: string, config: HooksJson): Promise<void> {
  const dir = path.dirname(configPath);
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
}

export async function isHookInstalled(agent: AGENT): Promise<boolean> {
  const configPath = getHooksConfigPath(agent);
  if (!configPath) {
    return false;
  }

  try {
    const config = await readHooksConfig(configPath);
    // Check if post_write_code hook array has at least one entry
    return (config.hooks.post_write_code?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function installHook(
  languageClient: SonarLintExtendedLanguageClient,
  agent: AGENT
): Promise<void> {
  const configPath = getHooksConfigPath(agent);
  const scriptDir = getHookScriptDirectory(agent);
  
  if (!configPath || !scriptDir) {
    vscode.window.showErrorMessage(`Hook configuration not supported for ${agent}`);
    return;
  }

  try {
    // Get hook script and configuration content from language server
    const response = await languageClient.getHookScriptContent(agent.toLowerCase());
    
    // Create hooks directory if it doesn't exist
    await fs.promises.mkdir(scriptDir, { recursive: true });

    const scriptFilePath = path.join(scriptDir, response.scriptFileName);

    // Check if hook already exists
    const alreadyInstalled = await isHookInstalled(agent);
    if (alreadyInstalled) {
      const overwrite = await vscode.window.showWarningMessage(
        `Hook script already exists. Do you want to overwrite it?`,
        'Overwrite',
        'Cancel'
      );
      if (overwrite !== 'Overwrite') {
        return;
      }
    }

    // Write hook script
    await fs.promises.writeFile(scriptFilePath, response.scriptContent, { encoding: 'utf8' });

    // Set executable permissions on Unix systems
    if (process.platform !== 'win32') {
      await fs.promises.chmod(scriptFilePath, 0o755);
    }

    // Replace placeholder in config content with actual script path
    const configContent = response.configContent.replace('{{SCRIPT_PATH}}', scriptFilePath);

    // Write hooks configuration file
    await fs.promises.writeFile(configPath, configContent, { encoding: 'utf8' });

    vscode.window.showInformationMessage(
      `Hook script installed successfully for ${agent}. Code will be analyzed automatically after AI generation.`
    );
    
    // Refresh the AI agents configuration tree
    vscode.commands.executeCommand(Commands.REFRESH_AI_AGENTS_CONFIGURATION);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to install hook script: ${error.message}`);
  }
}

export async function uninstallHook(agent: AGENT): Promise<void> {
  const configPath = getHooksConfigPath(agent);
  const scriptDir = getHookScriptDirectory(agent);
  
  if (!configPath || !scriptDir) {
    vscode.window.showErrorMessage(`Hook configuration not supported for ${agent}`);
    return;
  }

  try {
    const installed = await isHookInstalled(agent);
    if (!installed) {
      vscode.window.showInformationMessage('No hook script found to uninstall.');
      return;
    }

    const confirm = await vscode.window.showWarningMessage(
      'Are you sure you want to uninstall the hook script?',
      'Uninstall',
      'Cancel'
    );

    if (confirm !== 'Uninstall') {
      return;
    }

    // Remove hook from hooks.json
    const config = await readHooksConfig(configPath);
    if (config.hooks.post_write_code) {
      config.hooks.post_write_code = config.hooks.post_write_code.filter(
        hook => !hook.command.includes('post_write_code.')
      );
    }
    await writeHooksConfig(configPath, config);

    // Delete script files
    try {
      const files = await fs.promises.readdir(scriptDir);
      const hookFiles = files.filter(file => file.startsWith('post_write_code.'));
      for (const file of hookFiles) {
        await fs.promises.unlink(path.join(scriptDir, file));
      }
    } catch {
      // Script files may not exist, that's ok
    }

    vscode.window.showInformationMessage('Hook script uninstalled successfully.');
    
    // Refresh the AI agents configuration tree
    vscode.commands.executeCommand(Commands.REFRESH_AI_AGENTS_CONFIGURATION);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to uninstall hook script: ${error.message}`);
  }
}

export async function openHookScript(agent: AGENT): Promise<void> {
  const configPath = getHooksConfigPath(agent);
  
  if (!configPath) {
    vscode.window.showErrorMessage(`Hook configuration not supported for ${agent}`);
    return;
  }

  try {
    const config = await readHooksConfig(configPath);
    const hookConfig = config.hooks.post_write_code?.find(hook => 
      hook.command.includes('post_write_code.')
    );

    if (!hookConfig) {
      vscode.window.showInformationMessage('No hook script found. Please install it first.');
      return;
    }

    // Open the script file referenced in the hook configuration
    const document = await vscode.workspace.openTextDocument(hookConfig.command);
    await vscode.window.showTextDocument(document);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to open hook script: ${error.message}`);
  }
}

export async function regenerateHooks(languageClient: SonarLintExtendedLanguageClient): Promise<void> {
  const agent = getCurrentAgentWithHookSupport();
  if (!agent) {
    return;
  }

  const installed = await isHookInstalled(agent);
  if (installed) {
    // Silently regenerate the hook with the new port
    await installHook(languageClient, agent);
  }
}

