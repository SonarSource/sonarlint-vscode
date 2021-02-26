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

/**
 * Base decoration type for secondary locations.
 * See contributes.colors in package.json for theme color values.
 */
const SECONDARY_LOCATION_DECORATIONS = vscode.window.createTextEditorDecorationType({
  backgroundColor: new vscode.ThemeColor('sonarlint.locations.background'),
  before: {
    backgroundColor: new vscode.ThemeColor('sonarlint.locations.indexBackground'),
    color: new vscode.ThemeColor('sonarlint.locations.indexText'),
    margin: '0.2em'
  },
  rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
});

/**
 * Decoration type for selected secondary location.
 * See contributes.colors in package.json for theme color values.
 */
const SELECTED_SECONDARY_LOCATION_DECORATION = vscode.window.createTextEditorDecorationType({
  backgroundColor: new vscode.ThemeColor('sonarlint.locations.background'),
  before: {
    backgroundColor: new vscode.ThemeColor('sonarlint.locations.indexSelectedBackground'),
    color: new vscode.ThemeColor('sonarlint.locations.indexSelectedText'),
    fontWeight: 'bold',
    margin: '0.2em'
  },
  rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
});


class IssueItem extends vscode.TreeItem {
  readonly children: FlowItem[] | LocationItem[];

  constructor(issue: Issue) {
    const highlightOnly = issue.flows.every(f => f.locations.every(l => !l.message || l.message === ''));
    super(issue.message, highlightOnly ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Expanded);
    this.description = `(${issue.ruleKey})`;
    const severityIcon = resolveExtensionFile('images', 'severity', `${issue.severity.toLowerCase()}.png`);
    this.iconPath = {
      light: severityIcon,
      dark: severityIcon
    };
    console.log(JSON.stringify(issue.flows));
    if (highlightOnly) {
      // "Highlight only" locations, no node appended
      this.children = [];
    } else if (issue.flows.every(f => f.locations.length === 1)) {
      // All flows have one location (e.g duplication): flatten to location nodes
      this.children = issue.flows.map((f, i) => new LocationItem(f.locations[0], i + 1, this));
    } else {
      // General case
      this.children = issue.flows.map((f, i) => new FlowItem(f, i, this));
    }
  }
}

class FlowItem extends vscode.TreeItem {
  readonly parent: LocationTreeItem;
  readonly children: (LocationItem | FileItem)[];

  constructor(flow: Flow, index: number, parent: LocationTreeItem) {
    const collapsibleState = index === 0 ?
      // Only first flow is expanded by default
      vscode.TreeItemCollapsibleState.Expanded :
      vscode.TreeItemCollapsibleState.Collapsed;
    super(`Flow ${index + 1}`, collapsibleState);

    const flowLocations = Array.from(flow.locations);
    flowLocations.reverse();

    if (new Set(flowLocations.map(l => l.uri)).size > 1) {
      // Locations are spread over several files: group locations by file URI
      let index = 0;
      let currentUri = null;
      let fileLocations = [];
      this.children = [];
      while(index < flowLocations.length) {
        currentUri = flowLocations[index].uri;
        fileLocations.push(flowLocations[index]);
        if (index === flowLocations.length - 1 || flowLocations[index + 1].uri !== currentUri) {
          this.children.push(new FileItem(currentUri, index + 1, fileLocations, this));
          fileLocations = [];
        }
        index += 1;
      }
    } else {
      // Locations are all in the current file
      this.children = flowLocations.map((l, i) => new LocationItem(l, i + 1, this));
    }

    this.parent = parent;
  }
}

class FileItem extends vscode.TreeItem {
  readonly children: LocationItem[];
  readonly parent: FlowItem;

  constructor(uri: string, lastIndex: number, locations: Location[], parent: FlowItem) {
    super(uri.substring(uri.lastIndexOf('/') + 1), vscode.TreeItemCollapsibleState.Expanded);
    this.children = locations.map((l, i) => new LocationItem(l, lastIndex + 1 - locations.length + i, this));
    this.parent = parent;
    this.resourceUri = vscode.Uri.parse(uri);
    this.iconPath = vscode.ThemeIcon.File;
  }
}

class LocationItem extends vscode.TreeItem {
  readonly parent: LocationParentItem;
  readonly location: Location;
  readonly index: number;
  constructor(location: Location, index: number, parent: LocationParentItem) {
    super(`${index}: ${location.message}`, vscode.TreeItemCollapsibleState.None);
    this.index = index;
    this.description = `[${location.textRange.startLine}, ${location.textRange.startLineOffset}]`;
    this.command = {
      title: 'Navigate',
      command: Commands.NAVIGATE_TO_LOCATION,
      arguments: [ this ]
    };
    this.parent = parent;
    this.location = location;
  }
}

type ChildItem = FlowItem | FileItem | LocationItem;

type LocationParentItem = IssueItem | FlowItem | FileItem;

type LocationTreeItem = IssueItem | ChildItem;

export class SecondaryLocationsTree implements vscode.TreeDataProvider<LocationTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<LocationTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private rootItem?: IssueItem;

  constructor() {
    this.rootItem = null;
  }

  async showAllLocations(issue: Issue) {
    this.rootItem = new IssueItem(issue);
    this.notifyRootChanged();
    if (this.rootItem.children.length === 0) {
      // Highlight-only locations
      const uri = issue.fileUri;
      const editor = await vscode.window.showTextDocument(vscode.Uri.parse(uri));

      const locations = issue.flows
        .map(f => f.locations)
        .reduce((acc, cur) => acc.concat(cur), []);
      editor.setDecorations(SECONDARY_LOCATION_DECORATIONS,
        locations.map((l, i) => buildDecoration(new LocationItem(l, i + 1, this.rootItem)))
      );
    } else if (this.rootItem.children[0] instanceof LocationItem) {
      // Flattened locations: take the first one
      navigateToLocation(this.rootItem.children[0]);
    } else if (this.rootItem.children[0].children[0] instanceof LocationItem) {
      // Locations in a single file: take the first location of the first flow
      navigateToLocation(this.rootItem.children[0].children[0]);
    } else {
      // Multiple file locations: take the first location of the first file of the first flow
      navigateToLocation(this.rootItem.children[0].children[0].children[0]);
    }
  }

  hideLocations() {
    this.rootItem = null;
    this.notifyRootChanged();
    vscode.window.visibleTextEditors.forEach(
      e => {
        e.setDecorations(SECONDARY_LOCATION_DECORATIONS, []);
        e.setDecorations(SELECTED_SECONDARY_LOCATION_DECORATION, []);
      }
    );
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
    } else if (element instanceof FileItem) {
      return element.children;
    } else {
      return [];
    }
  }

  getParent(element?: LocationTreeItem) {
    if (element === this.rootItem) {
      return null;
    } else {
      return (element as ChildItem).parent;
    }
  }
}

export async function navigateToLocation(item: LocationItem) {
  const { uri, textRange } = item.location;
  const editor = await vscode.window.showTextDocument(vscode.Uri.parse(uri));
  const startPosition = new vscode.Position(textRange.startLine - 1, textRange.startLineOffset);
  const endPosition = new vscode.Position(textRange.endLine - 1, textRange.endLineOffset);
  editor.selection = new vscode.Selection(startPosition,endPosition);
  editor.revealRange(new vscode.Range(startPosition, endPosition), vscode.TextEditorRevealType.InCenter);

  editor.setDecorations(SELECTED_SECONDARY_LOCATION_DECORATION, [ buildDecoration(item) ]);
  editor.setDecorations(SECONDARY_LOCATION_DECORATIONS, buildSiblingDecorations(item));
}

function buildDecoration(item: LocationItem) {
  const location = item.location;
  return ({
    range: new vscode.Range(
      new vscode.Position(location.textRange.startLine - 1, location.textRange.startLineOffset),
      new vscode.Position(location.textRange.endLine - 1, location.textRange.endLineOffset)
    ),
    hoverMessage: location.message,
    renderOptions: {
      before: {
        // \u2000 is Unicode's "EN QUAD", which is usually rendered narrower than a normal \u0020 space
        contentText: `\u2000${item.index}\u2000`
      }
    }
  });
}

function buildSiblingDecorations(item: LocationItem) {
  return (item.parent.children as LocationItem[])
    .filter(i => i !== item)
    .filter(i => i.location.uri === item.location.uri)
    .map(buildDecoration);
}
