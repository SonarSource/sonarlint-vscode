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

interface LabsFeature {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  enabled: boolean;
  requiresConnectedMode: boolean;
  learnMoreUrl: string;
  feedbackUrl: string;
}

export class LabsWebviewProvider implements vscode.WebviewViewProvider {
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
          case 'learnMore':
            this._handleLearnMore(message.featureId);
            break;
          case 'giveFeedback':
            this._handleGiveFeedback(message.featureId);
            break;
          case 'openConnectedMode':
            this._handleOpenConnectedMode();
            break;
        }
      },
      undefined,
      this._extensionContext.subscriptions
    );
  }

  private _handleLearnMore(featureId: string) {
    // URLs for learn more documentation
    const urls: { [key: string]: string } = {
      connectedMode: 'https://docs.sonarsource.com/sonarqube-for-ide/vs-code/using-sonarlint/connected-mode/',
      analyzeCTAs: 'https://docs.sonarsource.com/sonarqube-for-ide/vs-code/',
      mcpRules: 'https://docs.sonarsource.com/sonarqube-for-ide/vs-code/',
      qualityGateInsights: 'https://docs.sonarsource.com/sonarqube-for-ide/vs-code/'
    };

    if (urls[featureId]) {
      vscode.env.openExternal(vscode.Uri.parse(urls[featureId]));
    }
  }

  private _handleGiveFeedback(featureId: string) {
    // Open feedback form - this could be a specific URL per feature
    const feedbackUrl = `https://community.sonarsource.com/c/help/sl/13?tags=labs,${featureId}`;
    vscode.env.openExternal(vscode.Uri.parse(feedbackUrl));
  }

  private _handleOpenConnectedMode() {
    vscode.commands.executeCommand('SonarLint.ConnectToSonarQube');
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const resolver = new ResourceResolver(util.extensionContext, webview);
    const styleSrc = resolver.resolve('styles', 'labs.css');
    const nonce = this._getNonce(); // Generate nonce ONCE
    
    // Resolve image paths
    const connectedModeImg = resolver.resolve('images', 'sonarqube-for-vscode.gif');
    const analyzeCTAsImg = resolver.resolve('images', 'sonarlint_overview.png');
    const mcpRulesImg = resolver.resolve('images', 'sonarqube-rule-description.gif');
    const qualityGateImg = resolver.resolve('images', 'what_is_sonarlint.png');

    // Feature data
    const features: LabsFeature[] = [
      {
        id: 'connectedMode',
        title: 'Connected Mode',
        description: 'Sync your local IDE with SonarQube Cloud or Server for unified quality tracking across your entire team\'s workflow.',
        imageUrl: connectedModeImg,
        enabled: true,
        requiresConnectedMode: false,
        learnMoreUrl: 'https://docs.sonarsource.com/sonarqube-for-ide/vs-code/using-sonarlint/connected-mode/',
        feedbackUrl: 'https://community.sonarsource.com'
      },
      {
        id: 'analyzeCTAs',
        title: 'Analyze CTAs',
        description: 'Smart call-to-action prompts that guide you to analyze code at the right time, improving your development workflow efficiency.',
        imageUrl: analyzeCTAsImg,
        enabled: true,
        requiresConnectedMode: false,
        learnMoreUrl: 'https://docs.sonarsource.com/sonarqube-for-ide/vs-code/',
        feedbackUrl: 'https://community.sonarsource.com'
      },
      {
        id: 'mcpRules',
        title: 'MCP+ Rules',
        description: 'Enhanced rule configuration through Model Context Protocol, enabling custom quality gates and smart code policy enforcement.',
        imageUrl: mcpRulesImg,
        enabled: false,
        requiresConnectedMode: true,
        learnMoreUrl: 'https://docs.sonarsource.com/sonarqube-for-ide/vs-code/',
        feedbackUrl: 'https://community.sonarsource.com'
      },
      {
        id: 'qualityGateInsights',
        title: 'Quality Gate Insights',
        description: 'Real-time quality gate status and actionable insights directly in your IDE before you commit code.',
        imageUrl: qualityGateImg,
        enabled: true,
        requiresConnectedMode: false,
        learnMoreUrl: 'https://docs.sonarsource.com/sonarqube-for-ide/vs-code/',
        feedbackUrl: 'https://community.sonarsource.com'
      }
    ];

    const featuresJson = JSON.stringify(features);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" 
          content="default-src 'none'; style-src ${webview.cspSource}; img-src ${webview.cspSource} https: data:; script-src 'nonce-${nonce}';"/>
    <link rel="stylesheet" type="text/css" href="${styleSrc}" />
    <title>SonarQube for IDE Labs</title>
</head>
<body class="labs-main-view">
    <div class="labs-header">
        <h1 class="labs-title">SonarQube for IDE Labs <span class="feature-count">(4 features ready for feedback)</span></h1>
    </div>

    <div class="features-grid">
        <!-- Features will be dynamically rendered here -->
    </div>

    <div class="labs-footer">
        <p>Questions, feedback, or issues? <a href="#" id="shareCommunityLink">Share on Sonar Community</a></p>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const features = ${featuresJson};

        function renderFeatures() {
            const grid = document.querySelector('.features-grid');
            grid.innerHTML = features.map(feature => \`
                <div class="feature-card \${!feature.enabled ? 'disabled' : ''}">
                    <div class="feature-image">
                        <img src="\${feature.imageUrl}" alt="\${feature.title}" />
                        \${feature.requiresConnectedMode && !feature.enabled ? 
                            '<div class="requires-badge">Requires Connected Mode <a href="#" class="badge-link" data-action="openConnectedMode">🔗</a></div>' : 
                            ''}
                    </div>
                    <div class="feature-content">
                        <h3 class="feature-title">\${feature.title}</h3>
                        <p class="feature-description">\${feature.description}</p>
                        <div class="feature-actions">
                            <a href="#" class="learn-more-link" data-feature="\${feature.id}">
                                Learn More 
                                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                                    <path d="M14 3v9a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1h9a1 1 0 011 1zm-1 0H3v9h10V3z"/>
                                    <path d="M6 7h4v1H6V7zm0 2h4v1H6V9zm0-4h4v1H6V5z"/>
                                </svg>
                            </a>
                            <button class="feedback-button" data-feature="\${feature.id}">
                                Give Feedback 🔗
                            </button>
                        </div>
                    </div>
                </div>
            \`).join('');

            // Attach event listeners
            document.querySelectorAll('.learn-more-link').forEach(link => {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    const featureId = e.currentTarget.dataset.feature;
                    vscode.postMessage({ command: 'learnMore', featureId });
                });
            });

            document.querySelectorAll('.feedback-button').forEach(button => {
                button.addEventListener('click', (e) => {
                    const featureId = e.currentTarget.dataset.feature;
                    vscode.postMessage({ command: 'giveFeedback', featureId });
                });
            });

            document.querySelectorAll('.badge-link').forEach(link => {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    vscode.postMessage({ command: 'openConnectedMode' });
                });
            });
        }

        document.getElementById('shareCommunityLink').addEventListener('click', (e) => {
            e.preventDefault();
            vscode.postMessage({ command: 'giveFeedback', featureId: 'general' });
        });

        // Initial render
        renderFeatures();
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

