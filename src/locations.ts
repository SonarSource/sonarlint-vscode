/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2021 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import { Commands } from './commands';
import { Flow, Issue, Location } from './protocol';
import { resolveExtensionFile } from './util';

class PlaceHolderItem extends vscode.TreeItem {
  constructor() {
    super('No issue selected', vscode.TreeItemCollapsibleState.None);
  }
}

class IssueItem extends vscode.TreeItem {
  readonly children: FlowItem[];

  constructor(issue: Issue) {
    super(issue.message, vscode.TreeItemCollapsibleState.Expanded);
    this.description = `(${issue.ruleKey})`;
    const severityIcon = resolveExtensionFile('images', 'severity', `${issue.severity.toLowerCase()}.png`);
    this.iconPath = {
      light: severityIcon,
      dark: severityIcon
    };
    this.children = issue.flows.map((f, i) => new FlowItem(f, i));
  }
}

class FlowItem extends vscode.TreeItem {
  readonly children: LocationItem[];

  constructor(flow: Flow, index: number) {
    super(`Flow ${index}`, vscode.TreeItemCollapsibleState.Expanded);
    this.children = flow.locations.map(l => new LocationItem(l));
  }
}

class LocationItem extends vscode.TreeItem {
  constructor(location: Location) {
    super(location.message, vscode.TreeItemCollapsibleState.None);
    this.command = {
      title: 'Navigate',
      command: Commands.NAVIGATE_TO_LOCATION,
      arguments: [ location ]
    };
  }
}

type RootItem = PlaceHolderItem | IssueItem;

type LocationTreeItem = RootItem | FlowItem | LocationItem;

export class SecondaryLocationsTree implements vscode.TreeDataProvider<LocationTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<LocationTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private rootItem?: RootItem;

  constructor() {
    this.rootItem = new PlaceHolderItem();
  }

  showAllLocations(issue: Issue) {
    this.rootItem = new IssueItem(issue);
    this.notifyRootChanged();
  }

  hideLocations() {
    this.rootItem = new PlaceHolderItem();
    this.notifyRootChanged();
  }

  private notifyRootChanged() {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: LocationTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: LocationTreeItem): vscode.ProviderResult<LocationTreeItem[]> {
    if (!element) {
      return [ this.rootItem ];
    } else if(element instanceof IssueItem) {
      return element.children;
    } else if (element instanceof FlowItem) {
      return element.children;
    } else {
      return [];
    }
  }
}

export async function navigateToLocation(location: Location) {
  const { uri, textRange } = location;
  const editor = await vscode.window.showTextDocument(vscode.Uri.parse(uri));
  const startPosition = new vscode.Position(textRange.startLine - 1, textRange.startLineOffset);
  const endPosition = new vscode.Position(textRange.endLine - 1, textRange.endLineOffset);
  editor.selection = new vscode.Selection(startPosition,endPosition);
  editor.revealRange(new vscode.Range(startPosition, endPosition), vscode.TextEditorRevealType.InCenter);
}
