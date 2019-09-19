/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2019 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as VSCode from 'vscode';

export type ConfigLevel = 'on' | 'off';

export interface RuleDescription {
  readonly key: string;
  readonly name: string;
  readonly htmlDescription: string;
  readonly type: string;
  readonly severity: string;
  readonly activeByDefault: boolean;
  levelFromConfig?: ConfigLevel;
}

function isActive(rule: RuleDescription) {
  return (rule.activeByDefault && rule.levelFromConfig !== 'off') || rule.levelFromConfig === 'on';
}

function actualLevel(rule: RuleDescription) {
  return isActive(rule) ? 'on' : 'off';
}

export interface RulesResponse {
  [language: string]: Array<RuleDescription>;
}

export class LanguageNode extends VSCode.TreeItem {
  constructor(label: string) {
    super(label, VSCode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = 'language';
  }
}

export class RuleNode extends VSCode.TreeItem {
  constructor(public readonly rule: RuleDescription) {
    super(`${rule.name} (${rule.key})`);
    this.contextValue = `rule-${actualLevel(rule)}`;
    this.id = rule.key;
    this.description = actualLevel(rule);
    this.command = {
      command: 'SonarLint.OpenRuleDesc',
      title: 'Show Description',
      arguments: [rule.key, rule.name, rule.htmlDescription, rule.type, rule.severity]
    };
  }
}

export type AllRulesNode = LanguageNode | RuleNode;

export class AllRulesTreeDataProvider implements VSCode.TreeDataProvider<AllRulesNode> {
  private readonly _onDidChangeTreeData = new VSCode.EventEmitter<AllRulesNode | undefined>();
  readonly onDidChangeTreeData: VSCode.Event<AllRulesNode | undefined> = this._onDidChangeTreeData.event;
  private levelFilter?: ConfigLevel;

  constructor(private readonly allRules: Thenable<RulesResponse>) {}

  async getChildren(node: AllRulesNode) {
    const localRuleConfig = VSCode.workspace.getConfiguration('sonarlint.rules');
    return this.allRules
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

  getParent(node: AllRulesNode) {
    if (node instanceof LanguageNode) {
      return Promise.resolve(null);
    } else {
      return this.allRules.then(response =>
        Object.keys(response)
          .filter(k => response[k].findIndex(r => r.key === node.rule.key) >= 0)
          .map(l => new LanguageNode(l))
          .pop()
      );
    }
  }

  getTreeItem(node: AllRulesNode) {
    return node;
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  filter(level?: ConfigLevel) {
    this.levelFilter = level;
    this.refresh();
  }
}

function byName(r1: RuleDescription, r2: RuleDescription) {
  return r1.name.toLowerCase() < r2.name.toLowerCase() ? -1 : r1.name.toLowerCase() > r2.name.toLowerCase() ? 1 : 0;
}
