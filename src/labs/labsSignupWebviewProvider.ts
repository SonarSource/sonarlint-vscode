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

export class LabsSignupWebviewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionContext: vscode.ExtensionContext) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionContext.extensionUri]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(
      message => {
        switch (message.command) {
          case 'signup':
            this._handleSignup(message.email);
            break;
          case 'openFeature':
            this._handleOpenFeature(message.feature);
            break;
          case 'openLink':
            this._handleOpenLink(message.url);
            break;
        }
      },
      undefined,
      this._extensionContext.subscriptions
    );
  }

  private _handleSignup(email: string) {
    // TODO: Implement actual signup logic
    vscode.window.showInformationMessage(`Labs signup requested for: ${email}`);
  }

  private _handleOpenFeature(feature: string) {
    // TODO: Implement feature navigation
    vscode.window.showInformationMessage(`Opening feature: ${feature}`);
  }

  private _handleOpenLink(urlType: string) {
    const urls = {
      terms: 'https://www.sonarsource.com/terms-of-service/',
      privacy: 'https://www.sonarsource.com/privacy-policy/'
    };
    if (urls[urlType]) {
      vscode.env.openExternal(vscode.Uri.parse(urls[urlType]));
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const resolver = new ResourceResolver(util.extensionContext, webview);
    const styleSrc = resolver.resolve('styles', 'labs.css');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" 
          content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${this._getNonce()}';"/>
    <link rel="stylesheet" type="text/css" href="${styleSrc}" />
    <title>SonarQube for IDE Labs</title>
</head>
<body>
    <h1>Be a Sonar Insider</h1>
    
    <div class="hero-section">
        <div class="mascot">🦑</div>
        <div class="features-box">
            <h2>Features for Feedback:</h2>
            <ul class="features-list">
                <li>• <a href="#" id="connectedModeLink">Connected Mode</a></li>
                <li>• <a href="#" id="analyzeCTAsLink">Analyze CTAs</a></li>
                <li>• <a href="#" id="mcpRulesLink">MCP + Rules</a></li>
            </ul>
            <p class="features-more">... and more to come!</p>
        </div>
    </div>

    <p class="description">
        Get early access to our newest features and help shape the future of SonarQube for IDE. 
        Sign up for Labs to test new functionality and provide feedback directly to our team.
    </p>

    <div class="input-group">
        <input type="email" id="email" placeholder="Enter your email" />
    </div>

    <button id="joinBtn" class="join-button">Join SonarQube for IDE Labs</button>

    <p class="legal-text">
        By selecting "Join SonarQube for IDE Labs," you agree to take part in SonarQube for IDE 
        Labs activities and accept the SonarQube Cloud 
        <a href="#" id="termsLink">Terms of Service</a> and 
        <a href="#" id="privacyLink">Privacy Policy</a>
    </p>

    <script nonce="${this._getNonce()}">
        const vscode = acquireVsCodeApi();

        document.getElementById('joinBtn').addEventListener('click', () => {
            const email = document.getElementById('email').value;
            if (email && email.includes('@')) {
                vscode.postMessage({
                    command: 'signup',
                    email: email
                });
            }
        });

        // Feature links
        document.getElementById('connectedModeLink').addEventListener('click', (e) => {
            e.preventDefault();
            vscode.postMessage({ command: 'openFeature', feature: 'connectedMode' });
        });

        document.getElementById('analyzeCTAsLink').addEventListener('click', (e) => {
            e.preventDefault();
            vscode.postMessage({ command: 'openFeature', feature: 'analyzeCTAs' });
        });

        document.getElementById('mcpRulesLink').addEventListener('click', (e) => {
            e.preventDefault();
            vscode.postMessage({ command: 'openFeature', feature: 'mcpRules' });
        });

        // Legal links
        document.getElementById('termsLink').addEventListener('click', (e) => {
            e.preventDefault();
            vscode.postMessage({ command: 'openLink', url: 'terms' });
        });

        document.getElementById('privacyLink').addEventListener('click', (e) => {
            e.preventDefault();
            vscode.postMessage({ command: 'openLink', url: 'privacy' });
        });
    </script>
</body>
</html>`;
  }

  private _getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}

