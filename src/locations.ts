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

class IssueItem extends vscode.TreeItem {
  readonly children: FlowItem[] | LocationItem[];

  constructor(issue: Issue) {
    super(issue.message, vscode.TreeItemCollapsibleState.Expanded);
    this.description = `(${issue.ruleKey})`;
    const severityIcon = resolveExtensionFile('images', 'severity', `${issue.severity.toLowerCase()}.png`);
    this.iconPath = {
      light: severityIcon,
      dark: severityIcon
    };
    if (issue.flows.length === 1) {
      // Single flow: skip the flow node
      const locations = issue.flows[0].locations;
      this.children = locations.map((l, i) => new LocationItem(l, locations.length - i));
      this.children.reverse();
    } else if (issue.flows.every(f => f.locations.length === 1)) {
      // All flows have one location (duplication): flatten to location nodes
      this.children = issue.flows.map((f, i) => new LocationItem(f.locations[0], i + 1));
    } else if (issue.flows.every(f => f.locations.every(l => !l.message || l.message === ''))) {
      // "Highlight only" locations
      this.children = [];
    } else {
      // General case
      this.children = issue.flows.map((f, i) => new FlowItem(f, i));
    }
  }
}

class FlowItem extends vscode.TreeItem {
  readonly children: LocationItem[];

  constructor(flow: Flow, index: number) {
    const collapsibleState = index === 0 ?
      // Only first flow is expanded by default
      vscode.TreeItemCollapsibleState.Expanded :
      vscode.TreeItemCollapsibleState.Collapsed;
    super(`Flow ${index + 1}`, collapsibleState);
    this.children = flow.locations.map((l, i) => new LocationItem(l, flow.locations.length - i));
    this.children.reverse();
  }
}

class LocationItem extends vscode.TreeItem {
  constructor(location: Location, index: number) {
    super(`${index}: ${location.message}`, vscode.TreeItemCollapsibleState.None);
    this.description = `[${location.textRange.startLine}, ${location.textRange.startLineOffset}]`;
    this.command = {
      title: 'Navigate',
      command: Commands.NAVIGATE_TO_LOCATION,
      arguments: [ location ]
    };
  }
}

type LocationTreeItem = IssueItem | FlowItem | LocationItem;

export class SecondaryLocationsTree implements vscode.TreeDataProvider<LocationTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<LocationTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private rootItem?: IssueItem;

  constructor() {
    this.rootItem = null;
  }

  showAllLocations(issue: Issue) {
    this.rootItem = new IssueItem(issue);
    this.notifyRootChanged();
  }

  hideLocations() {
    this.rootItem = null;
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

  getParent(element?: LocationTreeItem) {
    if (element === this.rootItem) {
      return null;
    } else {
      throw Error('Only implemented for root node!');
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
