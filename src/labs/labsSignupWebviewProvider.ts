/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

'use strict';

import * as vscode from 'vscode';
import { ResourceResolver } from '../util/webview';
import * as util from '../util/util';
import { SonarLintExtendedLanguageClient } from '../lsp/client';
import { Commands } from '../util/commands';
import * as fs from 'node:fs';

export class LabsSignupWebviewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;

  constructor(
    private readonly extensionContext: vscode.ExtensionContext,
    private readonly languageClient: SonarLintExtendedLanguageClient
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionContext.extensionUri]
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(
      message => {
        switch (message.command) {
          case 'signup':
            this.handleSignup(message.email);
            break;
          case 'openLink':
            this.handleOpenLink(message.linkId);
            break;
        }
      },
      undefined,
      this.extensionContext.subscriptions
    );
  }

  private async handleSignup(email: string) {
    try {
      this._view?.webview.postMessage({ command: 'signupLoading' });
      const response = await this.languageClient.joinIdeLabsProgram(email, vscode.env.appName);
      if (response.success) {
        vscode.window.showInformationMessage('Congratulations! You have joined SonarQube for IDE Labs!');
        this._view?.webview.postMessage({ command: 'signupSuccess' });
      } else {
        this._view?.webview.postMessage({
          command: 'signupError',
          message: response.message || 'Failed to join SonarQube for IDE Labs.'
        });
      }
    } catch (error) {
      this._view?.webview.postMessage({
        command: 'signupError',
        message: `Failed to join Labs program: ${error.message}`
      });
    }
  }

  private handleOpenLink(linkId: string) {
    const utmContent = 'ide-labs-signup';
    vscode.commands.executeCommand(Commands.TRIGGER_HELP_AND_FEEDBACK_LINK, {
      id: linkId,
      utm: { content: utmContent, term: linkId }
    });
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const resolver = new ResourceResolver(util.extensionContext, webview);
    const styleSrc = resolver.resolve('styles', 'labs.css');
    const webviewMainUri = resolver.resolve('webview-ui', 'labssignup.js');

    const templatePath = util.resolveExtensionFile('webview-ui', 'labssignup.html');
    const template = fs.readFileSync(templatePath.fsPath, 'utf-8');

    return template
      .replaceAll('{{cspSource}}', webview.cspSource)
      .replace('{{styleSrc}}', styleSrc)
      .replace('{{webviewMainUri}}', webviewMainUri);
  }
}
