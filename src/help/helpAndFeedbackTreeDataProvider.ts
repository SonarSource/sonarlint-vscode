/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as VSCode from 'vscode';
import { Commands } from '../util/commands';
import { SonarLintDocumentation } from '../commons';

export interface HelpAndFeedbackItem {
  id: string;
  label: string;
  url: string;
  icon: string;
}

export const helpAndFeedbackViewItems: HelpAndFeedbackItem[] = [
  {
    id: 'docs',
    label: 'Read Documentation',
    url: SonarLintDocumentation.BASE_DOCS_URL,
    icon: 'book'
  },
  {
    id: 'getHelp',
    label: 'Get Help | Report Issue',
    url: 'https://community.sonarsource.com/c/sl/vs-code/36',
    icon: 'comment-discussion'
  },
  {
    id: 'supportedRules',
    label: 'See Languages & Rules',
    url: SonarLintDocumentation.LANGUAGES_AND_RULES,
    icon: 'checklist'
  },
  {
    id: 'whatsNew',
    label: "Check What's New",
    url: 'https://www.sonarsource.com/products/sonarlint/whats-new/vs-code/',
    icon: 'megaphone'
  },
  {
    id: 'suggestFeature',
    label: 'Suggest a Feature',
    url: 'https://www.sonarsource.com/products/sonarlint/roadmap/',
    icon: 'extensions'
  },
  {
    id: 'faq',
    label: 'Review FAQ',
    url: 'https://community.sonarsource.com/t/frequently-asked-questions/7204',
    icon: 'question'
  }
];

export function getHelpAndFeedbackItemById(id: string): HelpAndFeedbackItem {
  return helpAndFeedbackViewItems.find(i => i.id === id);
}

export class HelpAndFeedbackLink extends VSCode.TreeItem {
  constructor(public readonly id) {
    const itemById = getHelpAndFeedbackItemById(id);
    super(itemById.label, VSCode.TreeItemCollapsibleState.None);
    this.iconPath = new VSCode.ThemeIcon(itemById.icon);
    this.command = {
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
    return helpAndFeedbackViewItems.map(item => new HelpAndFeedbackLink(item.id));
  }

  getTreeItem(element: HelpAndFeedbackLink): VSCode.TreeItem {
    return element;
  }
}
