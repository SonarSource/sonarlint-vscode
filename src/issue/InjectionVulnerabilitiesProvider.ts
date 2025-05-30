/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

'use strict';

import * as vscode from 'vscode';
import { getFileNameFromFullPath, getRelativePathFromFullPath } from '../util/uri';

export class FileGroup extends vscode.TreeItem {
  public fileUri: string;
  constructor(public readonly id: string) {
    super(getFileNameFromFullPath(id), vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'hotspotsFileGroup';
    this.fileUri = id;
    const specifyWorkspaceFolderName = vscode.workspace.workspaceFolders.length > 1;
    this.resourceUri = vscode.Uri.parse(this.fileUri);
    this.description = getRelativePathFromFullPath(
      id,
      vscode.workspace.getWorkspaceFolder(this.resourceUri),
      specifyWorkspaceFolderName
    );
    this.iconPath = vscode.ThemeIcon.File;
  }
}

export class ProblemNode extends vscode.TreeItem {
  constructor(
    public readonly key: string,
    // public readonly serverIssueKey: string,
    // public readonly source: string,
    public readonly message: string,
    public readonly ruleKey: string
  ) // public readonly fileUri: string,
  // public readonly status: number
  {
    super(message, vscode.TreeItemCollapsibleState.None);
    this.id = key;
    // if (source === OPEN_HOTSPOT_IN_IDE_SOURCE) {
    //   this.command = {
    //     command: Commands.HIGHLIGHT_REMOTE_HOTSPOT_LOCATION,
    //     title: 'Show Hotspot Location',
    //     arguments: [this]
    //   };
    // } else {
    //   this.command = { command: Commands.SHOW_HOTSPOT_LOCATION, title: 'Show All Locations', arguments: [this] };
    // }
    this.description = `TAINT_(${ruleKey})`;
  }
}

export class InjectionVulnerabilitiesProvider implements vscode.TreeDataProvider<ProblemNode | FileGroup> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<ProblemNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private readonly diagnostics = new Map<string, vscode.Diagnostic[]>();
  private readonly decorationType = vscode.window.createTextEditorDecorationType({
    isWholeLine: false,
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedOpen,
    textDecoration: 'wavy underline',
    color: new vscode.ThemeColor('editorWarning.foreground'),
    overviewRulerColor: new vscode.ThemeColor('editorWarning.foreground'),
    overviewRulerLane: vscode.OverviewRulerLane.Right
  });

  constructor() {
    // Update decorations when the active editor changes
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor) {
        this.updateDecorations(editor);
      }
    });

    // Track content changes and update decorations
    vscode.workspace.onDidChangeTextDocument(event => {
      const editor = vscode.window.activeTextEditor;
      if (editor && event.document === editor.document) {
        // Adjust ranges based on content changes
        const uri = editor.document.uri.toString();
        let diagnostics = this.diagnostics.get(uri) || [];

        event.contentChanges.forEach(change => {
          const newlineCount = (change.text.match(/\n/g) || []).length;
          const lineDelta = newlineCount - (change.range.end.line - change.range.start.line);
          diagnostics = diagnostics.map(diagnostic => {
            if (change.range.end.line < diagnostic.range.start.line) {
                // line number change
                diagnostic.range = diagnostic.range.with({
                    start: diagnostic.range.start.translate(lineDelta, 0),
                    end: diagnostic.range.end.translate(lineDelta, 0)
                });
                return diagnostic;
            } else if (
              // offset change
              diagnostic.range.start.isAfter(change.range.end)
            ) {
              const offsetDelta = change.text.length - (change.range.end.character - change.range.start.character);
              diagnostic.range = diagnostic.range.with({
                start: diagnostic.range.start.translate(0, offsetDelta),
                end: diagnostic.range.end.translate(0, offsetDelta)
              });
              return diagnostic;
            }
            return diagnostic; // No change needed
          });
        });

        this.diagnostics.set(uri, diagnostics);
        this.updateDecorations(editor);
      }
    });
  }

  private updateDecorations(editor: vscode.TextEditor) {
    const uri = editor.document.uri.toString();
    const diagnostics = this.diagnostics.get(uri) || [];

    const decorations = diagnostics.map(diagnostic => ({
      range: diagnostic.range,
      hoverMessage: diagnostic.message
    }));

    editor.setDecorations(this.decorationType, decorations);
  }

  // Update diagnostics and refresh view
  updateDiagnostics(uri: vscode.Uri, diagnostics: vscode.Diagnostic[]) {
    this.diagnostics.set(uri.toString(), diagnostics);
    this._onDidChangeTreeData.fire(undefined);

    // Update decorations if this is the active editor
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.uri.toString() === uri.toString()) {
      this.updateDecorations(editor);
    }
  }

  getTreeItem(element: ProblemNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: FileGroup | ProblemNode): FileGroup[] | ProblemNode[] {
    if (!element) {
      return Array.from(this.diagnostics.keys()).map(uri => new FileGroup(uri));
    } else if (element instanceof FileGroup) {
      return this.diagnostics
        .get(element.fileUri)
        .map(diag => new ProblemNode(diag['data'].entryKey, diag.message, diag.source));
    }
    return [];
  }

  getBadgeNumber() {
    return Array.from(this.diagnostics.values()).flatMap(d => d).length;
  }
}
