/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'node:fs';
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

const HOOK_SCRIPT_PERMISSIONS = 0o700;
const HOOK_SCRIPT_PATTERN = /sonarqube_analysis_hook\.(js|py|sh)$/;

export function getCurrentAgentWithHookSupport(): AGENT | undefined {
  const appName = vscode.env.appName.toLowerCase();
  // Hooks are only available on windsurf-next (beta) for now
  if (appName.includes('windsurf') && appName.includes('next')) {
    return AGENT.WINDSURF;
  }
  return undefined;
}

function getWindsurfDirectory(): string {
  const appName = vscode.env.appName.toLowerCase();
  if (appName.includes('next')) {
    return 'windsurf-next';
  }
  return 'windsurf';
}

function getHooksConfigPath(agent: AGENT): string | undefined {
  switch (agent) {
    case AGENT.WINDSURF: {
      const homeDir = process.env.HOME || process.env.USERPROFILE;
      if (!homeDir) {
        return undefined;
      }
      const windsurfDir = getWindsurfDirectory();
      return path.join(homeDir, '.codeium', windsurfDir, 'hooks.json');
    }
    case AGENT.CURSOR:
      return undefined;
    default:
      return undefined;
  }
}

function getHookScriptDirectory(agent: AGENT): string | undefined {
  switch (agent) {
    case AGENT.WINDSURF: {
      const homeDir = process.env.HOME || process.env.USERPROFILE;
      if (!homeDir) {
        return undefined;
      }
      const windsurfDir = getWindsurfDirectory();
      return path.join(homeDir, '.codeium', windsurfDir, 'hooks');
    }
    case AGENT.CURSOR:
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
  const scriptDir = getHookScriptDirectory(agent);
  
  if (!configPath || !scriptDir) {
    return false;
  }

  try {
    const config = await readHooksConfig(configPath);
    // Check if our specific SonarQube hook is installed
    const hooks = config.hooks.post_write_code || [];
    return hooks.some(hook => {
      const normalizedCommand = hook.command.replaceAll('\\', '/');
      const normalizedScriptDir = scriptDir.replaceAll('\\', '/');
      return (
        normalizedCommand.includes(normalizedScriptDir) &&
        HOOK_SCRIPT_PATTERN.exec(normalizedCommand) !== null
      );
    });
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
    const response = await languageClient.getAiAgentHookScriptContent(agent.toLowerCase());
    
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

    await fs.promises.writeFile(scriptFilePath, response.scriptContent, { encoding: 'utf8' });

    // Set executable permissions on Unix systems
    if (process.platform !== 'win32') {
      await fs.promises.chmod(scriptFilePath, HOOK_SCRIPT_PERMISSIONS);
    }

    const existingConfig = await readHooksConfig(configPath);

    // Parse the new hook config and replace placeholder
    const newConfigContent = response.configContent.replace('{{SCRIPT_PATH}}', scriptFilePath);
    const newConfig = JSON.parse(newConfigContent) as HooksJson;

    // Merge: Remove any existing SonarLint hooks from OUR hooks directory, then add the new one
    const existingHooks = existingConfig.hooks.post_write_code || [];
    const filteredHooks = existingHooks.filter(hook => {
      // Only remove hooks that point to our specific script files in our hooks directory
      const normalizedCommand = hook.command.replaceAll('\\', '/');
      const normalizedScriptDir = scriptDir.replaceAll('\\', '/');
      return !(
        normalizedCommand.includes(normalizedScriptDir) &&
        HOOK_SCRIPT_PATTERN.exec(normalizedCommand) !== null
      );
    });
    existingConfig.hooks.post_write_code = [...filteredHooks, ...newConfig.hooks.post_write_code];

    await writeHooksConfig(configPath, existingConfig);

    vscode.window.showInformationMessage(
      `Hook script installed successfully for ${agent}. Code will be analyzed automatically after AI generation.`
    );

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

    const config = await readHooksConfig(configPath);
    if (config.hooks.post_write_code) {
      config.hooks.post_write_code = config.hooks.post_write_code.filter(hook => {
        // Only remove hooks that point to our specific script files in our hooks directory
        const normalizedCommand = hook.command.replaceAll('\\', '/');
        const normalizedScriptDir = scriptDir.replaceAll('\\', '/');
        return !(
          normalizedCommand.includes(normalizedScriptDir) &&
          HOOK_SCRIPT_PATTERN.exec(normalizedCommand) !== null
        );
      });
    }
    await writeHooksConfig(configPath, config);

    // Delete script files
    try {
      const files = await fs.promises.readdir(scriptDir);
      const hookFiles = files.filter(file => file.startsWith('sonarqube_analysis_hook.'));
      for (const file of hookFiles) {
        await fs.promises.unlink(path.join(scriptDir, file));
      }
    } catch {
      // Script files may not exist, that's ok
    }

    vscode.window.showInformationMessage('Hook script uninstalled successfully.');

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
      hook.command.includes('sonarqube_analysis_hook.')
    );

    if (!hookConfig) {
      vscode.window.showInformationMessage('No hook script found. Please install it first.');
      return;
    }

    const document = await vscode.workspace.openTextDocument(hookConfig.command);
    await vscode.window.showTextDocument(document);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to open hook script: ${error.message}`);
  }
}

export async function openHookConfiguration(agent: AGENT): Promise<void> {
  const configPath = getHooksConfigPath(agent);
  
  if (!configPath) {
    vscode.window.showErrorMessage(`Hook configuration not supported for ${agent}`);
    return;
  }

  try {
    if (!fs.existsSync(configPath)) {
      vscode.window.showInformationMessage('No hook configuration found. Please install the hook first.');
      return;
    }

    const document = await vscode.workspace.openTextDocument(configPath);
    await vscode.window.showTextDocument(document);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to open hook configuration: ${error.message}`);
  }
}

