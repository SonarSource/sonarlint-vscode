/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import { Commands } from '../util/commands';
import { Flow, Issue, Location, TextRange } from '../lsp/protocol';
import { formatIssueMessage, resolveExtensionFile } from '../util/util';

/**
 * Base decoration type for secondary locations.
 * See contributes.colors in package.json for theme color values.
 */

const SONARLINT_LOCATIONS_BACKGROUND = 'sonarlint.locations.background';

const SECONDARY_LOCATION_DECORATIONS = vscode.window.createTextEditorDecorationType({
  backgroundColor: new vscode.ThemeColor(SONARLINT_LOCATIONS_BACKGROUND),
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
  backgroundColor: new vscode.ThemeColor(SONARLINT_LOCATIONS_BACKGROUND),
  before: {
    backgroundColor: new vscode.ThemeColor('sonarlint.locations.indexSelectedBackground'),
    color: new vscode.ThemeColor('sonarlint.locations.indexSelectedText'),
    fontWeight: 'bold',
    margin: '0.2em'
  },
  rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
});

export const SINGLE_LOCATION_DECORATION = vscode.window.createTextEditorDecorationType({
  backgroundColor: new vscode.ThemeColor(SONARLINT_LOCATIONS_BACKGROUND),
  textDecoration: 'wavy var(--vscode-inputValidation-warningBorder) 0.25px underline',
  rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
});

export class IssueItem extends vscode.TreeItem {
  readonly children: FlowItem[] | LocationItem[];

  constructor(issueOrHotspot: Issue) {
    const highlightOnly = issueOrHotspot.flows.every(f => f.locations.every(l => !l.message || l.message === ''));
    const collapsibleState = highlightOnly
      ? vscode.TreeItemCollapsibleState.None
      : vscode.TreeItemCollapsibleState.Expanded;
    super(issueOrHotspot.message, collapsibleState);
    this.description = `(${issueOrHotspot.ruleKey})`;
    if (highlightOnly) {
      // "Highlight only" locations, no node appended
      this.children = [];
    } else if (issueOrHotspot.flows.every(f => f.locations.length === 1)) {
      // All flows have one location (e.g duplication): flatten to location nodes
      this.children = issueOrHotspot.flows.map((f, i) => new LocationItem(f.locations[0], i + 1, this));
    } else {
      // General case
      this.children = issueOrHotspot.flows.map((f, i) => new FlowItem(f, i, this));
    }
  }
}

export class FlowItem extends vscode.TreeItem {
  readonly parent: LocationTreeItem;
  readonly children: (LocationItem | FileItem)[];

  constructor(flow: Flow, index: number, parent: LocationTreeItem) {
    // Only first flow is expanded by default
    const collapsibleState =
      index === 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed;
    super(`Flow ${index + 1}`, collapsibleState);

    const flowLocations = Array.from(flow.locations);
    flowLocations.reverse();

    if (new Set(flowLocations.map(l => l.uri)).size > 1) {
      // Locations are spread over several files: group locations by file URI
      let locationIndex = 0;
      let currentUri = null;
      let currentPath = null;
      let fileLocations = [];
      this.children = [];
      while (locationIndex < flowLocations.length) {
        currentUri = flowLocations[locationIndex].uri;
        currentPath = flowLocations[locationIndex].filePath;
        fileLocations.push(flowLocations[locationIndex]);
        if (locationIndex === flowLocations.length - 1 || flowLocations[locationIndex + 1].uri !== currentUri) {
          this.children.push(new FileItem(currentUri, currentPath, locationIndex + 1, fileLocations, this));
          fileLocations = [];
        }
        locationIndex += 1;
      }
    } else {
      // Locations are all in the current file
      this.children = flowLocations.map((l, i) => new LocationItem(l, i + 1, this));
    }

    this.parent = parent;
  }
}

export class FileItem extends vscode.TreeItem {
  readonly children: LocationItem[];
  readonly parent: FlowItem;

  constructor(uri: string | null, filePath: string, lastIndex: number, locations: Location[], parent: FlowItem) {
    const label = uri ? uri.substring(uri.lastIndexOf('/') + 1) : filePath.substring(filePath.lastIndexOf('/') + 1);
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.children = locations.map((l, i) => new LocationItem(l, lastIndex + 1 - locations.length + i, this));
    this.parent = parent;
    this.resourceUri = uri ? vscode.Uri.parse(uri) : null;
    if (!uri) {
      // Override default tooltip (generated from resourceUri) when uri is invalid
      this.tooltip = filePath;
    }
    this.iconPath = vscode.ThemeIcon.File;
  }
}

export class LocationItem extends vscode.TreeItem {
  readonly parent: LocationParentItem;
  readonly location: Location;
  readonly index: number;
  constructor(location: Location, index: number, parent: LocationParentItem) {
    super(`${index}: ${location.message}`, vscode.TreeItemCollapsibleState.None);
    this.index = index;
    if (location.uri) {
      if (location.exists) {
        if (location.codeMatches) {
          this.description = `[${location.textRange.startLine}, ${location.textRange.startLineOffset}]`;
        } else {
          this.description = '(local code does not match)';
        }
        this.command = {
          title: 'Navigate',
          command: Commands.NAVIGATE_TO_LOCATION,
          arguments: [this]
        };
      } else {
        this.description = '(unreachable in local code)';
      }
    } else {
      this.description = '(unreachable in local code)';
    }
    this.parent = parent;
    this.location = location;
  }
}

type ChildItem = FlowItem | FileItem | LocationItem;

type LocationParentItem = IssueItem | FlowItem | FileItem;

export type LocationTreeItem = IssueItem | ChildItem;

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

      const locations = issue.flows.map(f => f.locations).reduce((acc, cur) => acc.concat(cur), []);
      if (locations.length > 0) {
        editor.setDecorations(
          SECONDARY_LOCATION_DECORATIONS,
          locations.map((l, i) => buildDecoration(new LocationItem(l, i + 1, this.rootItem), editor.document))
        );
      } else {
        const range = vscodeRange(issue.textRange);
        if (isValidRange(range, editor.document)) {
          editor.selection = new vscode.Selection(range.start, range.end);
          editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
          editor.setDecorations(SINGLE_LOCATION_DECORATION, [
            { range, hoverMessage: formatIssueMessage(issue.message, issue.ruleKey) }
          ]);
        }
      }
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
    vscode.window.visibleTextEditors.forEach(e => {
      e.setDecorations(SECONDARY_LOCATION_DECORATIONS, []);
      e.setDecorations(SELECTED_SECONDARY_LOCATION_DECORATION, []);
      e.setDecorations(SINGLE_LOCATION_DECORATION, []);
    });
  }

  private notifyRootChanged() {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: LocationTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: LocationTreeItem): vscode.ProviderResult<LocationTreeItem[]> {
    if (!element) {
      return [this.rootItem];
    } else if (element instanceof IssueItem) {
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
  const textRange = item.location.textRange;
  const uri = item.location.uri ? item.location.uri : item.location.filePath;
  const editor = await vscode.window.showTextDocument(vscode.Uri.parse(uri));
  const range = vscodeRange(textRange);
  if (isValidRange(range, editor.document)) {
    editor.selection = new vscode.Selection(range.start, range.end);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
  }
  editor.setDecorations(SELECTED_SECONDARY_LOCATION_DECORATION, buildMainDecorations(item, editor.document));
  editor.setDecorations(SECONDARY_LOCATION_DECORATIONS, buildSiblingDecorations(item, editor.document));
}

function buildMainDecorations(item: LocationItem, document: vscode.TextDocument) {
  return [buildDecoration(item, document)].filter(d => d);
}

function buildSiblingDecorations(item: LocationItem, document: vscode.TextDocument) {
  const locationsInSameFile =
    item.parent instanceof FileItem
      ? (item.parent.parent.children as FileItem[])
          .filter(f => hasSameNullSafeResourceUri(f, item.parent as FileItem))
          .map(f => f.children)
          .reduce((acc, cur) => acc.concat(cur), [])
      : (item.parent.children as LocationItem[]);
  return locationsInSameFile
    .filter(i => i !== item)
    .filter(i => i.location.textRange)
    .map(i => buildDecoration(i, document))
    .filter(d => d);
}

function hasSameNullSafeResourceUri(f1: FileItem, f2: FileItem) {
  return (
    (f1.resourceUri === null && f2.resourceUri === null) ||
    (f1.resourceUri !== null && f2.resourceUri !== null && f1.resourceUri.toString() === f2.resourceUri.toString())
  );
}

function buildDecoration(item: LocationItem, document: vscode.TextDocument) {
  const location = item.location;
  const range = new vscode.Range(
    new vscode.Position(location.textRange.startLine - 1, location.textRange.startLineOffset),
    new vscode.Position(location.textRange.endLine - 1, location.textRange.endLineOffset)
  );
  if (!isValidRange(range, document)) {
    // Range is not exactly matched in local code
    return null;
  }
  return {
    range,
    hoverMessage: location.message,
    renderOptions: {
      before: {
        // \u2000 is Unicode's "EN QUAD", which is usually rendered narrower than a normal \u0020 space
        contentText: `\u2000${item.index}\u2000`
      }
    }
  };
}

function vscodeRange(textRange: TextRange) {
  const startPosition = new vscode.Position(textRange.startLine - 1, textRange.startLineOffset);
  const endPosition = new vscode.Position(textRange.endLine - 1, textRange.endLineOffset);
  return new vscode.Range(startPosition, endPosition);
}

export function isValidRange(textRange: vscode.Range, document: vscode.TextDocument) {
  const validatedRange = document.validateRange(textRange);
  return textRange.isEqual(validatedRange);
}
