/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as VSCode from 'vscode';
import { Commands } from '../util/commands';
import { HelpAndFeedbackItem, helpAndFeedbackItems } from './constants';

export function getHelpAndFeedbackItemById(id: string): HelpAndFeedbackItem {
  return helpAndFeedbackItems.find(i => i.id === id);
}

export class HelpAndFeedbackLink extends VSCode.TreeItem {
  constructor(public readonly id) {
    const itemById = getHelpAndFeedbackItemById(id);
    super(itemById.label, VSCode.TreeItemCollapsibleState.None);
    this.iconPath = new VSCode.ThemeIcon(itemById.icon);
    this.command = itemById.command ? itemById.command : {
      command: Commands.TRIGGER_HELP_AND_FEEDBACK_LINK,
      title: 'Trigger Help and Feedback Link',
      arguments: [itemById]
    };
  }
}

export class HelpAndFeedbackTreeDataProvider implements VSCode.TreeDataProvider<HelpAndFeedbackLink> {
  private readonly _onDidChangeTreeData = new VSCode.EventEmitter<HelpAndFeedbackLink | undefined>();
  readonly onDidChangeTreeData: VSCode.Event<HelpAndFeedbackLink | undefined> = this._onDidChangeTreeData.event;

  refresh() {
    this._onDidChangeTreeData.fire(null);
  }

  getChildren(element?: HelpAndFeedbackLink): HelpAndFeedbackLink[] {
    return helpAndFeedbackItems
      .filter(item => item.viewItem)
      .map(item => new HelpAndFeedbackLink(item.id));
  }

  getTreeItem(element: HelpAndFeedbackLink): VSCode.TreeItem {
    return element;
  }
}
