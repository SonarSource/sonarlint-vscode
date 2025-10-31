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
    vscode.commands.executeCommand(Commands.TRIGGER_HELP_AND_FEEDBACK_LINK,
        { id: linkId, utm: { content: utmContent, term: linkId }});
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const resolver = new ResourceResolver(util.extensionContext, webview);
    const styleSrc = resolver.resolve('styles', 'labs.css');
    const webviewMainUri = resolver.resolve('webview-ui', 'labssignup.js');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" 
          content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline';"/>
    <link rel="stylesheet" type="text/css" href="${styleSrc}" />
    <script type="module" src="${webviewMainUri}"></script>
    <title>SonarQube for IDE Labs</title>
</head>
<body>
    <h1>Be a Sonar Insider</h1>
    
    <div class="hero-section">
        <div class="mascot">🦑</div>
        <div class="features-box">
            <h2>Features for Feedback:</h2>
            <ul class="features-list">
                <li>• <a href="#" id="preCommitAnalysisLink">Pre-commit Analysis</a></li>
                <li>• <a href="#" id="mcpIntegrationLink">AI Agents Integration</a></li>
                <li>• <a href="#" id="dependencyRiskManagementLink">Dependency Risk Management</a></li>
            </ul>
            <p class="features-more">... and more to come!</p>
        </div>
    </div>

    <p class="description">
        Get early access to our newest features and help shape the future of SonarQube for IDE. 
        Sign up for Labs to test new functionality and provide feedback directly to our team.
    </p>

    <div class="input-group">
        <div id="errorMessage" class="error-message" style="display: none;"></div>
        <input type="email" id="email" placeholder="Enter your email" />
    </div>

    <button id="joinBtn" class="join-button">
        <span class="button-text">Join SonarQube for IDE Labs</span>
    </button>

    <p class="legal-text">
        By selecting "Join SonarQube for IDE Labs", you agree to take part in SonarQube for IDE 
        Labs activities and accept the SonarQube Cloud 
        <a href="#" id="termsLink">Terms of Service</a> and 
        <a href="#" id="privacyLink">Privacy Policy</a>
    </p>
    </body>
</html>`;
  }
}
