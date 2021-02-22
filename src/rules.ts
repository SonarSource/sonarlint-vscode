/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2021 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as VSCode from 'vscode';

export type ConfigLevel = 'on' | 'off';

export interface Rule {
  readonly key: string;
  readonly name: string;
  readonly activeByDefault: boolean;
  levelFromConfig?: ConfigLevel;
}

function isActive(rule: Rule) {
  return (rule.activeByDefault && rule.levelFromConfig !== 'off') || rule.levelFromConfig === 'on';
}

function actualLevel(rule: Rule) {
  return isActive(rule) ? 'on' : 'off';
}

export interface RulesResponse {
  [language: string]: Array<Rule>;
}

export class LanguageNode extends VSCode.TreeItem {
  constructor(label: string) {
    super(label, VSCode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = 'language';
  }
}

export class RuleNode extends VSCode.TreeItem {
  constructor(public readonly rule: Rule) {
    super(`${rule.name}`);
    this.contextValue = `rule-${actualLevel(rule)}`;
    this.id = rule.key.toUpperCase();
    this.description = `${actualLevel(rule)}`;
    this.command = {
      command: 'SonarLint.OpenStandaloneRuleDesc',
      title: 'Show Description',
      arguments: [rule.key]
    };
  }
}

export type AllRulesNode = LanguageNode | RuleNode;

export class AllRulesTreeDataProvider implements VSCode.TreeDataProvider<AllRulesNode> {
  private readonly _onDidChangeTreeData = new VSCode.EventEmitter<AllRulesNode | undefined>();
  readonly onDidChangeTreeData: VSCode.Event<AllRulesNode | undefined> = this._onDidChangeTreeData.event;
  private levelFilter?: ConfigLevel;
  private allRules: Thenable<RulesResponse>;

  constructor(private readonly allRulesProvider: () => Thenable<RulesResponse>) {}

  async getChildren(node: AllRulesNode) {
    const localRuleConfig = VSCode.workspace.getConfiguration('sonarlint.rules');
    return this.getAllRules()
      .then(response => {
        Object.keys(response).forEach(language => response[language].sort(byName));
        return response;
      })
      .then(response => {
        // Render rules under language nodes
        if (node) {
          return response[node.label]
            .map(rule => {
              rule.levelFromConfig = localRuleConfig.get(rule.key, {})['level'];
              return rule;
            })
            .filter(r => {
              if (this.levelFilter === 'on') {
                return isActive(r);
              } else if (this.levelFilter === 'off') {
                return !isActive(r);
              } else {
                return true;
              }
            })
            .map(rule => new RuleNode(rule));
        } else {
          // Roots are language nodes
          return Object.keys(response)
            .sort()
            .map(language => new LanguageNode(language));
        }
      });
  }

  private getAllRules(): Thenable<RulesResponse> {
    if (!this.allRules) {
      this.allRules = this.allRulesProvider();
    }
    return this.allRules;
  }

  getParent(node: AllRulesNode) {
    if (node instanceof LanguageNode) {
      return Promise.resolve(null);
    } else {
      return this.getAllRules().then(response =>
        Object.keys(response)
          .filter(k => response[k].findIndex(r => r.key.toUpperCase() === node.rule.key.toUpperCase()) >= 0)
          .map(l => new LanguageNode(l))
          .pop()
      );
    }
  }

  getTreeItem(node: AllRulesNode) {
    return node;
  }

  refresh() {
    this._onDidChangeTreeData.fire(null);
  }

  filter(level?: ConfigLevel) {
    this.levelFilter = level;
    this.refresh();
  }

  async checkRuleExists(key: string) {
    return this.getAllRules().then(response =>
      Object.keys(response).filter(k => response[k].findIndex(r => r.key.toUpperCase() === key.toUpperCase()) >= 0)
        .length === 0
        ? `Key not found ${key}`
        : ''
    );
  }
}

function byName(r1: Rule, r2: Rule) {
  return r1.name.toLowerCase().localeCompare(r2.name.toLowerCase());
}
