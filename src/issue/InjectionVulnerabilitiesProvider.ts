/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

'use strict';

import * as vscode from 'vscode';
import { FileGroup } from './FindingsProvider';
import { Commands } from '../util/commands';

export class ProblemNode extends vscode.TreeItem {
  constructor(
    public readonly key: string,
    public readonly message: string,
    public readonly ruleKey: string,
    public readonly source: string,
    public readonly fileUri: string
  )
  {
    super(message, vscode.TreeItemCollapsibleState.None);
    this.id = key;
    this.description = `${source} (${ruleKey})`;
    this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('editorError.foreground'));
    this.command = { command: Commands.DISPLAY_ISSUE, title: 'Display Issue', arguments: [this] };
  }
}

export class InjectionVulnerabilitiesProvider implements vscode.TreeDataProvider<ProblemNode | FileGroup> {
  private static _instance: InjectionVulnerabilitiesProvider;
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

  static init() {
    this._instance = new InjectionVulnerabilitiesProvider();
  }

  static get instance(): InjectionVulnerabilitiesProvider {
    return InjectionVulnerabilitiesProvider._instance;
  }

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
      hoverMessage: (() => {
        // PoC that we can use a command link in hover messages
        const md = new vscode.MarkdownString('$(lock)' + diagnostic.message + ' [call command](command:SonarLint.ConnectedMode.focus)');
        md.isTrusted = true;
        md.supportThemeIcons = true;
        // PoC that we can use a code block in hover messages
        md.appendCodeblock(`Rule: ${diagnostic.source}`, 'text');
        return md;
      })()
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
        .map(diag => new ProblemNode(diag['data'], diag.message, diag.code as string, diag.source, element.fileUri));
    }
    return [];
  }

  getBadgeNumber() {
    return Array.from(this.diagnostics.values()).flatMap(d => d).length;
  }
}
