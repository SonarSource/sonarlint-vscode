/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as VSCode from 'vscode';
import { identity, negate } from 'lodash';
import { BindingService } from '../connected/binding';
import { ExtendedServer } from '../lsp/protocol';
import { getSonarLintConfiguration } from '../settings/settings';
import { Commands } from '../util/commands';

function isActive(rule: ExtendedServer.Rule) {
  return (rule.activeByDefault && rule.levelFromConfig !== 'off') || rule.levelFromConfig === 'on';
}

function actualLevel(rule: ExtendedServer.Rule) {
  return isActive(rule) ? 'on' : 'off';
}

export class LanguageNode extends VSCode.TreeItem {
  constructor(label: string) {
    super(label, VSCode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = 'language';
  }
}

export class RuleNode extends VSCode.TreeItem {
  constructor(public readonly rule: ExtendedServer.Rule) {
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
  private levelFilter?: ExtendedServer.ConfigLevel;
  private allRules: ExtendedServer.RulesResponse;

  constructor(private readonly allRulesProvider: () => Thenable<ExtendedServer.RulesResponse>) {}

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
          return response[node.label as string]
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

  private async getAllRules() {
    this.allRules ??= await this.allRulesProvider();
    return this.allRules;
  }

  async getParent(node: AllRulesNode) {
    if (node instanceof LanguageNode) {
      return null;
    } else {
      const response = await this.getAllRules();
      return Object.keys(response)
        .filter(k => response[k].findIndex(r => r.key.toUpperCase() === node.rule.key.toUpperCase()) >= 0)
        .map(l => new LanguageNode(l))
        .pop();
    }
  }

  getTreeItem(node: AllRulesNode) {
    return node;
  }

  refresh() {
    this._onDidChangeTreeData.fire(null);
  }

  filter(level?: ExtendedServer.ConfigLevel) {
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

function byName(r1: ExtendedServer.Rule, r2: ExtendedServer.Rule) {
  return r1.name.toLowerCase().localeCompare(r2.name.toLowerCase());
}

export function setRulesViewMessage(allRulesView: VSCode.TreeView<LanguageNode>) {
  const folderBindingStates = [...BindingService.instance.bindingStatePerFolder().values()];
  if (allFalse(folderBindingStates)) {
    allRulesView.message =
      'Changes to this view are restricted to your personal development environment; to share a rule set with your team, please use Connected Mode.';
  } else {
    allRulesView.message = "Changes to this view only apply to folders that don't use Connected Mode.";
  }
}

export function allTrue(values: boolean[]) {
  return values.length > 0 && values.every(identity);
}

export function allFalse(values: boolean[]) {
  return values.every(negate(identity));
}

export function toggleRule(level: ExtendedServer.ConfigLevel) {
  return async (ruleKey: string | RuleNode) => {
    const configuration = getSonarLintConfiguration();
    const rules = configuration.get('rules') || {};

    if (typeof ruleKey === 'string') {
      // This is when a rule is deactivated from a code action, and we only have the key, not the default activation.
      rules[ruleKey] = { level };
      configuration.update('rules', rules, VSCode.ConfigurationTarget.Global);
      if (level === 'off') {
        await notifyOnRuleDeactivation(ruleKey);
      }
      return null;
    } else {
      // When a rule is toggled from the list of rules, we can be smarter!
      const { key, activeByDefault } = ruleKey.rule;
      if ((level === 'on' && !activeByDefault) || (level === 'off' && activeByDefault)) {
        // Override default
        rules[key] = { level };
      } else {
        // Back to default
        rules[key] = undefined;
      }
      return configuration.update('rules', rules, VSCode.ConfigurationTarget.Global);
    }
  };
}

async function notifyOnRuleDeactivation(ruleKey: string) {
  const undoAction = 'Undo';
  const showAllRulesAction = 'Show All Rules';
  const selectedAction = await VSCode.window.showInformationMessage(
    `Sonar rule ${ruleKey} is now disabled in your local environment`,
    undoAction,
    showAllRulesAction
  );
  if (selectedAction === undoAction) {
    toggleRule('on')(ruleKey);
  } else if (selectedAction === showAllRulesAction) {
    await VSCode.commands.executeCommand(Commands.OPEN_RULE_BY_KEY, ruleKey);
  }
}
