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
import * as os from 'node:os';
import { SonarLintExtendedLanguageClient } from '../lsp/client';
import { Commands } from '../util/commands';
import { AGENT, getWindsurfDirectory } from './aiAgentUtils';

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

/**
 * Get the IDE-specific configuration directory.
 * For Windsurf: ~/.codeium/windsurf or ~/.codeium/windsurf-next
 * For Cursor: not yet supported
 */
function getIdeConfigDirectory(agent: AGENT): string | undefined {
  switch (agent) {
    case AGENT.WINDSURF: {
      const windsurfDir = getWindsurfDirectory();
      return path.join(os.homedir(), '.codeium', windsurfDir);
    }
    case AGENT.CURSOR:
      return undefined;
    case AGENT.KIRO:
      return undefined;
    default:
      return undefined;
  }
}

function getHooksConfigPath(agent: AGENT): string | undefined {
  const ideConfigDir = getIdeConfigDirectory(agent);
  return ideConfigDir ? path.join(ideConfigDir, 'hooks.json') : undefined;
}

function getHookScriptDirectory(agent: AGENT): string | undefined {
  const ideConfigDir = getIdeConfigDirectory(agent);
  return ideConfigDir ? path.join(ideConfigDir, 'hooks') : undefined;
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
  // Config directory should already exist if the IDE is running
  await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
}

/**
 * Check if a hook command references one of our SonarQube hook scripts.
 * Example command: "/home/user/.codeium/windsurf-next/hooks/sonarqube_analysis_hook.js"
 * Example scriptDir: "/home/user/.codeium/windsurf-next/hooks"
 */
function isSonarQubeHook(command: string, scriptDir: string): boolean {
  // Normalize paths to use forward slashes for consistent comparison across platforms
  // Windows: "C:\Users\user\.codeium\windsurf-next\hooks" -> "C:/Users/user/.codeium/windsurf-next/hooks"
  const normalizedCommand = command.replaceAll('\\', '/');
  const normalizedScriptDir = scriptDir.replaceAll('\\', '/');
  return (
    normalizedCommand.includes(normalizedScriptDir) &&
    HOOK_SCRIPT_PATTERN.exec(normalizedCommand) !== null
  );
}

export async function isHookInstalled(agent: AGENT): Promise<boolean> {
  const configPath = getHooksConfigPath(agent);
  const scriptDir = getHookScriptDirectory(agent);
  
  if (!configPath || !scriptDir) {
    return false;
  }

  try {
    const config = await readHooksConfig(configPath);
    // Check if our specific SonarQube hook is registered in the config
    const hooks = config.hooks.post_write_code || [];
    const hookRegistered = hooks.some(hook => isSonarQubeHook(hook.command, scriptDir));
    
    if (!hookRegistered) {
      return false;
    }
    
    // Also verify that the script file actually exists
    const scriptPath = hooks.find(hook => isSonarQubeHook(hook.command, scriptDir))?.command;
    if (scriptPath) {
      return fs.existsSync(scriptPath);
    }
    
    return false;
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
        { modal: true },
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
    const filteredHooks = existingHooks.filter(hook => !isSonarQubeHook(hook.command, scriptDir));
    existingConfig.hooks.post_write_code = [...filteredHooks, ...newConfig.hooks.post_write_code];

    await writeHooksConfig(configPath, existingConfig);

    await vscode.commands.executeCommand(Commands.REFRESH_AI_AGENTS_CONFIGURATION);

    vscode.window.showInformationMessage(
      `Hook script installed successfully for ${agent}. Code will be analyzed automatically after AI generation.`
    );
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
      { modal: true },
      'Uninstall',
      'Cancel'
    );

    if (confirm !== 'Uninstall') {
      return;
    }

    const config = await readHooksConfig(configPath);
    if (config.hooks.post_write_code) {
      config.hooks.post_write_code = config.hooks.post_write_code.filter(hook => !isSonarQubeHook(hook.command, scriptDir));
    }
    await writeHooksConfig(configPath, config);

    // Delete script files
    try {
      const files = await fs.promises.readdir(scriptDir);
      const hookFiles = files.filter(file => file.startsWith('sonarqube_analysis_hook.'));
      for (const file of hookFiles) {
        await fs.promises.unlink(path.join(scriptDir, file));
      }
    } catch (err) {
      // Script files may not exist or be in use, log but continue
      console.warn('Failed to delete hook script files:', err);
    }

    await vscode.commands.executeCommand(Commands.REFRESH_AI_AGENTS_CONFIGURATION);
    
    vscode.window.showInformationMessage('Hook script uninstalled successfully.');
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

