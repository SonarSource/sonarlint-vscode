/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as fs from 'node:fs';
import * as vscode from 'vscode';
import * as util from '../util/util';
import { RemediationService } from './remediationService';
import { generateRemediationContentHtml } from './remediationPanelContent';
import { ResourceResolver } from '../util/webview';
import { RemediationEventType } from './remediationEvent';
import { IssueService } from '../issue/issue';
import { Commands } from '../util/commands';
import { FixSuggestionService } from '../fixSuggestions/fixSuggestionsService';

const WEBVIEW_UI_DIR = 'webview-ui';

export class RemediationWebviewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _resolver: ResourceResolver;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly context: vscode.ExtensionContext) {
    RemediationService.instance.onEventsChanged(() => {
      this.updateContent();
      this.expandView();
    });
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    token: vscode.CancellationToken
  ): void | Thenable<void> {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri]
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(
      message => {
        if (message.command === 'navigateToEvent') {
          this.handleNavigateToEvent(message.eventId);
        }
      },
      undefined,
      this.disposables
    );
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    this._resolver = new ResourceResolver(this.context, webview);
    const templatePath = util.resolveExtensionFile(WEBVIEW_UI_DIR, 'remediation.html');
    const template = fs.readFileSync(templatePath.fsPath, 'utf-8');

    const themeCss = this._resolver.resolve('styles', 'theme.css');
    const remediationCss = this._resolver.resolve('styles', 'remediation.css');
    const scriptSrc = this._resolver.resolve(WEBVIEW_UI_DIR, 'remediation.js');

    const events = RemediationService.instance.getEvents();
    const contentHtml = generateRemediationContentHtml(events);

    return template
      .replaceAll('{{cspSource}}', webview.cspSource)
      .replace('{{themeCss}}', themeCss)
      .replace('{{remediationCss}}', remediationCss)
      .replace('{{scriptSrc}}', scriptSrc)
      .replace('<!-- Content will be dynamically rendered here -->', contentHtml);
  }

  private updateContent(): void {
    if (!this._view) {
      return;
    }

    const events = RemediationService.instance.getEvents();
    const contentHtml = generateRemediationContentHtml(events);

    this._view.webview.postMessage({
      command: 'updateContent',
      html: contentHtml
    });
  }

  private expandView(): void {
    if (this._view && RemediationService.instance.getEvents().length > 0) {
      this._view.show?.(true);
    }
  }

  private async handleNavigateToEvent(eventId: string): Promise<void> {
    const events = RemediationService.instance.getEvents();
    const event = events.find(e => e.id === eventId);

    if (!event) {
      return;
    }

    // Mark the event as viewed
    RemediationService.instance.markEventAsViewed(eventId);

    try {
      switch (event.type) {
        case RemediationEventType.OPEN_ISSUE:
          await IssueService.showIssue(event.issue);
          break;
        case RemediationEventType.OPEN_HOTSPOT:
          await this.openHotspotFile(event.hotspot);
          break;
        case RemediationEventType.VIEW_FIX_SUGGESTION:
          await FixSuggestionService.instance.showFixSuggestion(event.params);
          break;
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to navigate to event: ${error.message}`);
    }
  }

  private async openHotspotFile(hotspot): Promise<void> {
    try {
      const foundUris = await vscode.workspace.findFiles(`**/${hotspot.ideFilePath}`);
      if (foundUris.length === 0) {
        vscode.window.showErrorMessage(`Could not find file: ${hotspot.ideFilePath}`);
        return;
      }

      const documentUri = foundUris[0];
      const editor = await vscode.window.showTextDocument(documentUri);

      if (hotspot.textRange) {
        const range = new vscode.Range(
          hotspot.textRange.startLine - 1,
          hotspot.textRange.startLineOffset,
          hotspot.textRange.endLine - 1,
          hotspot.textRange.endLineOffset
        );
        editor.selection = new vscode.Selection(range.start, range.end);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
      }

      await vscode.commands.executeCommand(Commands.SHOW_HOTSPOT_DESCRIPTION);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to open hotspot: ${error.message}`);
    }
  }

  dispose(): void {
    this.disposables.forEach(d => d.dispose());
  }
}
