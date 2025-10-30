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

export class LabsSignupWebviewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;

  constructor(
    private readonly _extensionContext: vscode.ExtensionContext,
    private readonly _languageClient: SonarLintExtendedLanguageClient
  ) {}

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

  private async _handleSignup(email: string) {
    try {
      this._view?.webview.postMessage({ command: 'signupLoading' });
      const response = await this._languageClient.joinIdeLabsProgram(email, vscode.env.appName);
      if (response.success) {
        vscode.window.showInformationMessage(response.message || 'Successfully joined SonarQube for IDE Labs!');
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
          content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline';"/>
    <link rel="stylesheet" type="text/css" href="${styleSrc}" />
    <style>
        .error-message {
            color: #f44336;
            background-color: rgba(244, 67, 54, 0.1);
            padding: 8px 12px;
            margin-bottom: 8px;
            border-radius: 4px;
            border-left: 3px solid #f44336;
            font-size: 13px;
        }
        
        .spinner {
            display: inline-block;
            width: 14px;
            height: 14px;
            margin-right: 8px;
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-top-color: #ffffff;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
        }
        
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        
        .join-button.loading {
            opacity: 0.7;
            cursor: not-allowed;
        }
        
        .join-button .button-text {
            display: inline-flex;
            align-items: center;
        }
    </style>
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
        <div id="errorMessage" class="error-message" style="display: none;"></div>
        <input type="email" id="email" placeholder="Enter your email" />
    </div>

    <button id="joinBtn" class="join-button">
        <span class="button-text">Join SonarQube for IDE Labs</span>
    </button>

    <p class="legal-text">
        By selecting "Join SonarQube for IDE Labs," you agree to take part in SonarQube for IDE 
        Labs activities and accept the SonarQube Cloud 
        <a href="#" id="termsLink">Terms of Service</a> and 
        <a href="#" id="privacyLink">Privacy Policy</a>
    </p>

    <script>
        const vscode = acquireVsCodeApi();
        let errorMessageElement;
        let emailInput;
        let joinBtn;

        function showError(message) {
            if (errorMessageElement) {
                errorMessageElement.textContent = message;
                errorMessageElement.style.display = 'block';
            }
        }

        function hideError() {
            if (errorMessageElement) {
                errorMessageElement.style.display = 'none';
                errorMessageElement.textContent = '';
            }
        }

        function setLoading(loading) {
            if (joinBtn) {
                const buttonText = joinBtn.querySelector('.button-text');
                if (loading) {
                    joinBtn.disabled = true;
                    joinBtn.classList.add('loading');
                    if (buttonText) {
                        buttonText.innerHTML = '<span class="spinner"></span>Joining...';
                    }
                } else {
                    joinBtn.disabled = false;
                    joinBtn.classList.remove('loading');
                    if (buttonText) {
                        buttonText.innerHTML = 'Join SonarQube for IDE Labs';
                    }
                }
            }
        }

        function init() {
            errorMessageElement = document.getElementById('errorMessage');
            emailInput = document.getElementById('email');
            joinBtn = document.getElementById('joinBtn');

            // Clear error when user starts typing
            if (emailInput) {
                emailInput.addEventListener('input', () => {
                    hideError();
                });
            }

            if (joinBtn) {
                joinBtn.addEventListener('click', () => {
                    const email = emailInput ? emailInput.value : '';
                    if (email && email.includes('@')) {
                        hideError();
                        vscode.postMessage({
                            command: 'signup',
                            email: email
                        });
                    } else {
                        showError('Please enter a valid email address');
                    }
                });
            }

            // Feature links
            const connectedModeLink = document.getElementById('connectedModeLink');
            const analyzeCTAsLink = document.getElementById('analyzeCTAsLink');
            const mcpRulesLink = document.getElementById('mcpRulesLink');

            if (connectedModeLink) {
                connectedModeLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    vscode.postMessage({ command: 'openFeature', feature: 'connectedMode' });
                });
            }

            if (analyzeCTAsLink) {
                analyzeCTAsLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    vscode.postMessage({ command: 'openFeature', feature: 'analyzeCTAs' });
                });
            }

            if (mcpRulesLink) {
                mcpRulesLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    vscode.postMessage({ command: 'openFeature', feature: 'mcpRules' });
                });
            }

            // Legal links
            const termsLink = document.getElementById('termsLink');
            const privacyLink = document.getElementById('privacyLink');

            if (termsLink) {
                termsLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    vscode.postMessage({ command: 'openLink', url: 'terms' });
                });
            }

            if (privacyLink) {
                privacyLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    vscode.postMessage({ command: 'openLink', url: 'privacy' });
                });
            }
        }

        function handleMessage(event) {
            const message = event.data;
            switch (message.command) {
                case 'signupLoading':
                    setLoading(true);
                    break;
                case 'signupError':
                    setLoading(false);
                    showError(message.message);
                    break;
                case 'signupSuccess':
                    setLoading(false);
                    hideError();
                    if (emailInput) {
                        emailInput.value = '';
                    }
                    break;
            }
        }

        window.addEventListener('load', init);
        window.addEventListener('message', handleMessage);
    </script>
    </body>
</html>`;
  }
}

