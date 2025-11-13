/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as VSCode from 'vscode';
import { getCurrentSonarQubeMCPServerConfig } from './mcpServerConfig';
import { isSonarQubeRulesFileConfigured } from './aiAgentRuleConfig';
import { Commands } from '../util/commands';
import { getCurrentAgentWithMCPSupport } from './aiAgentUtils';

export class AIAgentsConfigurationItem extends VSCode.TreeItem {
  constructor(
    public readonly id: string,
    public readonly label: string,
    public readonly isConfigured: boolean,
    public readonly tooltipText?: string,
    public readonly configureCommand?: string,
    public readonly reconfigureCommand?: string
  ) {
    super(label, VSCode.TreeItemCollapsibleState.None);
    this.id = id;
    this.tooltip = this.getTooltip();
    this.iconPath = this.getStatusIcon();
    this.contextValue = 'aiAgentsConfigurationItem';
    this.command = {
      command: isConfigured ? (reconfigureCommand || configureCommand) : configureCommand,
      title: isConfigured ? 'Reconfigure' : 'Configure',
      arguments: []
    };
  }

  private getTooltip(): string {
    if (this.isConfigured) {
      return this.tooltipText ? `${this.tooltipText} • Configured` : 'Configured';
    }
    return this.tooltipText || 'Not configured';
  }

  private getStatusIcon(): VSCode.ThemeIcon {
    if (this.isConfigured) {
      return new VSCode.ThemeIcon('check', new VSCode.ThemeColor('testing.iconPassed'));
    }
    return new VSCode.ThemeIcon('circle-large-outline', new VSCode.ThemeColor('testing.iconQueued'));
  }
}

export class AIAgentsConfigurationTreeDataProvider implements VSCode.TreeDataProvider<AIAgentsConfigurationItem> {
  private readonly _onDidChangeTreeData = new VSCode.EventEmitter<AIAgentsConfigurationItem | undefined>();
  readonly onDidChangeTreeData: VSCode.Event<AIAgentsConfigurationItem | undefined> = this._onDidChangeTreeData.event;

  refresh() {
    this._onDidChangeTreeData.fire(null);
  }

  async getChildren(element?: AIAgentsConfigurationItem): Promise<AIAgentsConfigurationItem[]> {
    if (element) {
      return [];
    }

    const items: AIAgentsConfigurationItem[] = [];
    const isSupportingMCP = getCurrentAgentWithMCPSupport();

    const sonarQubeMCPServerConfigured = getCurrentSonarQubeMCPServerConfig() !== undefined;
    const rulesFileConfigured = await isSonarQubeRulesFileConfigured();

    if (!sonarQubeMCPServerConfigured && !rulesFileConfigured) {
      return [];
    }

    items.push(
      new AIAgentsConfigurationItem(
        'mcpServer',
        'Configure SonarQube MCP Server',
        sonarQubeMCPServerConfigured,
        'AI agent integration',
        Commands.CONFIGURE_MCP_SERVER,
        Commands.OPEN_MCP_SERVER_CONFIGURATION
      )
    );

    if (isSupportingMCP) {
      items.push(
        new AIAgentsConfigurationItem(
          'rulesFile',
          'Create Instructions for AI agents',
          rulesFileConfigured,
          'SonarQube MCP Server guide',
          Commands.INTRODUCE_SONARQUBE_RULES_FILE,
          Commands.OPEN_SONARQUBE_RULES_FILE
        )
      );
    }

    return items;
  }

  getTreeItem(element: AIAgentsConfigurationItem): VSCode.TreeItem {
    return element;
  }
}
