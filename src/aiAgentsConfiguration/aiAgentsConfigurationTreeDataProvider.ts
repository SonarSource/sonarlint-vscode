/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as VSCode from 'vscode';
import { getCurrentSonarQubeMCPServerConfig } from './mcpServerConfig';

export class AIAgentsConfigurationItem extends VSCode.TreeItem {
  constructor(
    public readonly id: string,
    public readonly label: string,
    public readonly isConfigured: boolean,
    public readonly description?: string,
    public readonly configureCommand?: string,
    public readonly reconfigureCommand?: string
  ) {
    super(label, VSCode.TreeItemCollapsibleState.None);
    this.id = id;
    this.description = this.getStatusDescription();
    this.iconPath = this.getStatusIcon();
    this.contextValue = 'aiAgentsConfigurationItem';
    this.command = {
      command: isConfigured ? (reconfigureCommand || configureCommand) : configureCommand,
      title: isConfigured ? 'Reconfigure' : 'Configure',
      arguments: []
    };
  }

  private getStatusDescription(): string {
    if (this.isConfigured) {
      return this.description ? `${this.description} • Configured` : 'Configured';
    }
    return this.description || 'Not configured';
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

  getChildren(element?: AIAgentsConfigurationItem): AIAgentsConfigurationItem[] {
    if (element) {
      return [];
    }

    const items: AIAgentsConfigurationItem[] = [];

    const sonarQubeMCPServerConfigured = getCurrentSonarQubeMCPServerConfig() !== undefined;
    const rulesFileConfigured = false;

    if (!sonarQubeMCPServerConfigured && !rulesFileConfigured) {
      return [];
    }

    items.push(new AIAgentsConfigurationItem(
        'mcpServer',
        'SonarQube MCP Server',
        sonarQubeMCPServerConfigured,
        'AI agent integration',
        'SonarLint.ConfigureMCPServer',
        'SonarLint.ConfigureMCPServer'
    ));

    items.push(new AIAgentsConfigurationItem(
      'rulesFile',
      'SonarQube Rules File',
      rulesFileConfigured,
      'Custom rule settings',
      'SonarLint.IntroduceSonarQubeRulesFile',
      'SonarLint.OpenSonarQubeRulesFile'
    ));

    return items;
  }

  getTreeItem(element: AIAgentsConfigurationItem): VSCode.TreeItem {
    return element;
  }
}