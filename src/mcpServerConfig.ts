/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as VSCode from 'vscode';
import { logToSonarLintOutput } from './util/logging';
import { Connection } from './connected/connections';
import { ConnectionSettingsService } from './settings/connectionsettings';
import { SonarLintExtendedLanguageClient } from './lsp/client';

interface MCPServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

interface MCPConfiguration {
  mcpServers: Record<string, MCPServerConfig>;
}

const MCP_CONFIG_FILE = 'mcp.json';

/**
 * Get the path to the MCP configuration file
 */
function getMCPConfigPath(): string {
  // MCP configuration is typically stored in ~/.cursor/mcp.json
  return path.join(os.homedir(), '.cursor', MCP_CONFIG_FILE);
}

/**
 * Read existing MCP configuration or create a default one
 */
function readMCPConfig(configPath: string): MCPConfiguration {
  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(content);
    }
  } catch (error) {
    logToSonarLintOutput(`Error reading MCP config: ${error.message}`);
  }

  // Return default configuration if file doesn't exist or couldn't be read
  return {
    mcpServers: {}
  };
}

/**
 * Write MCP configuration to file
 */
function writeMCPConfig(configPath: string, config: MCPConfiguration): void {
  try {
    // Ensure the directory exists
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // Write the configuration with proper formatting
    const content = JSON.stringify(config, null, 2);
    fs.writeFileSync(configPath, content, 'utf8');
    
    logToSonarLintOutput(`MCP configuration updated: ${configPath}`);
  } catch (error) {
    logToSonarLintOutput(`Error writing MCP config: ${error.message}`);
    throw error;
  }
}

/**
 * Get connection details from a specific connection for MCP configuration
 */
async function getTokenForMCP(connection: Connection): Promise<{ token: string }> {
  const isSonarQube = connection.contextValue === 'sonarqubeConnection';
  
  try {
    if (isSonarQube) {
      const connectionDetail = await ConnectionSettingsService.instance.loadSonarQubeConnection(connection.id);
      if (!connectionDetail) {
        throw new Error(`Could not find SonarQube Server connection with ID: ${connection.id}`);
      }
      
      return {
        token: connectionDetail.token || ''
      };
    } else {
      const connectionDetail = await ConnectionSettingsService.instance.loadSonarCloudConnection(connection.id);
      if (!connectionDetail) {
        throw new Error(`Could not find SonarCloud connection with ID: ${connection.id}`);
      }
      
      const region = connectionDetail.region || 'EU';
      
      return {
        token: connectionDetail.token || '',
      };
    }
  } catch (error) {
    logToSonarLintOutput(`Error getting connection details: ${error.message}`);
    throw error;
  }
}

/**
 * Configure MCP server for SonarQube
 */
export async function configureMCPServer(connection: Connection, languageClient: SonarLintExtendedLanguageClient): Promise<void> {
  try {
    const configPath = getMCPConfigPath();
    
    // Show information to user about what we're doing
    await VSCode.window.withProgress({
      location: VSCode.ProgressLocation.Notification,
      title: `Configuring SonarQube MCP Server for ${connection.label}`,
      cancellable: false
    }, async (progress) => {
      progress.report({ increment: 20, message: 'Reading existing configuration...' });

      // Read existing configuration
      const config = readMCPConfig(configPath);
      
      progress.report({ increment: 20, message: 'Getting connection details...' });

      // Get specific connection details
      const connectionDetails = await getTokenForMCP(connection);
      
      // Warn if connection doesn't have a token
      if (!connectionDetails.token) {
        const proceed = await VSCode.window.showWarningMessage(
          `The SonarQube connection "${connection.label}" doesn't have a token configured. The MCP server will be created but may not function properly without a valid token.`,
          'Proceed Anyway',
          'Cancel'
        );
        
        if (proceed !== 'Proceed Anyway') {
          return;
        }
      }

      progress.report({ increment: 20, message: 'Creating MCP server configuration...' });

      const sonarQubeMCPConfig = await languageClient.getMCPServerSettings(connection.id, connectionDetails.token);
      
      config.mcpServers.sonarqube = JSON.parse(sonarQubeMCPConfig.jsonSettings);
      
      progress.report({ increment: 20, message: 'Writing configuration...' });

      // Write updated configuration
      writeMCPConfig(configPath, config);
      
      progress.report({ increment: 20, message: 'Configuration complete!' });
    });

    // Show success message
    const openFile = await VSCode.window.showInformationMessage(
      `SonarQube MCP server configured for "${connection.label}"\n\nConfiguration saved to: ${configPath}`,
      'Open Configuration File'
    );
    
    if (openFile === 'Open Configuration File') {
      const uri = VSCode.Uri.file(configPath);
      await VSCode.window.showTextDocument(uri);
    }

    logToSonarLintOutput(`SonarQube MCP server configured successfully for connection: ${connection.label}`);

  } catch (error) {
    const errorMessage = `Failed to configure SonarQube MCP server for "${connection.label}": ${error.message}`;
    VSCode.window.showErrorMessage(errorMessage);
    logToSonarLintOutput(errorMessage);
    throw error;
  }
}

/**
 * Check if SonarQube MCP server is already configured
 */
export function isSonarQubeMCPConfigured(): boolean {
  try {
    const configPath = getMCPConfigPath();
    const config = readMCPConfig(configPath);
    return 'sonarqube' in config.mcpServers;
  } catch (error) {
    logToSonarLintOutput(`Error checking MCP configuration: ${error.message}`);
    return false;
  }
}
