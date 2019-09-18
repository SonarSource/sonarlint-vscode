/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2019 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as VSCode from 'vscode';

export interface RuleDescription {
  key: string;
  name: string;
  htmlDescription: string;
  type: string;
  severity: string;
  activeByDefault: boolean;
  configLevel?: 'on' | 'off';
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
    super(`${rule.name}`);
    this.contextValue = `rule-${
      (rule.activeByDefault && rule.configLevel !== 'off') ||
      (!rule.activeByDefault && rule.configLevel === 'on')  ? 'on' : 'off'
    }`;
    this.id = rule.key;
    this.description = rule.key;
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
  private activationFilter?: null | "on" | "off";

  constructor(private readonly allRules: Thenable<RulesResponse>) {}

  async getChildren(node: AllRulesNode) {
    const localRuleConfig = VSCode.workspace.getConfiguration('sonarlint.rules');
    return this.allRules
      .then(response => {
        Object.keys(response).forEach(language => response[language].sort(byName));
        return response;
      })
      .then(response => {
        if (node) {
          return response[node.label]
            .filter(r => {
              if (this.activationFilter === "on") {
                return r.activeByDefault || (localRuleConfig[r.key] || {}).level === "on";
              } else if (this.activationFilter === "off") {
                return !r.activeByDefault || (localRuleConfig[r.key] || {}).level === "off";
              } else {
                return true;
              }
            })
            .map(rule => {
            rule.configLevel = (localRuleConfig[rule.key] || {}).level;
            return new RuleNode(rule);
          });
        } else {
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

  filter(activation: null | "on" | "off") {
    this.activationFilter = activation;
    this.refresh();
  }
}

function byName(r1: RuleDescription, r2: RuleDescription) {
  return r1.name < r2.name ? -1 : r1.name > r2.name ? 1 : 0;
}
