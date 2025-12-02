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
import { ResourceResolver } from '../util/webview';
import { LABS_FEATURES } from './labsFeatures';
import { SonarLintExtendedLanguageClient } from '../lsp/client';
import { Commands } from '../util/commands';
import { IdeLabsFlagManagementService } from './ideLabsFlagManagementService';

const WEBVIEW_UI_DIR = 'webview-ui';

export class LabsWebviewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _resolver: ResourceResolver;

  constructor(
    private readonly extensionContext: vscode.ExtensionContext,
    private readonly languageClient: SonarLintExtendedLanguageClient
  ) {
    extensionContext.subscriptions.push(
      vscode.commands.registerCommand(Commands.ENABLE_LABS, () => {
        IdeLabsFlagManagementService.instance.enableIdeLabs();
        this._view?.webview.postMessage({ command: 'ideLabsEnabled' });
      }),
      vscode.commands.registerCommand(Commands.DISABLE_LABS, () => {
        IdeLabsFlagManagementService.instance.disableIdeLabs();
        this._view?.webview.postMessage({ command: 'ideLabsDisabled' });
      })
    );
    vscode.window.onDidChangeActiveColorTheme(theme => this._view?.webview.postMessage({ command: 'themeChanged', theme }));
  }

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

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(
      message => {
        switch (message.command) {
          case 'ready':
            this.sendInitialState();
            break;
          case 'signup':
            this.handleSignup(message.email);
            break;
          case 'openHelpLink':
            this.handleOpenHelpLink(message.linkId);
            break;
          case 'openFeedbackLink':
            this.handleOpenFeedbackLink(message.featureId);
            break;
          case 'openLearnMoreLink':
            this.handleOpenLearnMoreLink(message.featureId);
            break;
        }
      },
      undefined,
      this.extensionContext.subscriptions
    );
  }

  private sendInitialState() {
    const featuresWithImages = LABS_FEATURES.map(feature => ({
      ...feature,
      imageUrl: this._resolver.resolve('images', feature.imageFile)
    }));
    
    const isSignedUp = IdeLabsFlagManagementService.instance.isIdeLabsJoined();
    const isIdeLabsEnabled = IdeLabsFlagManagementService.instance.isIdeLabsEnabled();
    
    this._view?.webview.postMessage({
      command: 'initialState',
      isSignedUp,
      isIdeLabsEnabled,
      features: featuresWithImages
    });
  }

  private async handleSignup(email: string) {
    try {
      this._view?.webview.postMessage({ command: 'signupLoading' });
      const response = await this.languageClient.joinIdeLabsProgram(email, vscode.env.appName);
      if (response.success) {
        await IdeLabsFlagManagementService.instance.joinIdeLabs();
        
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

  private handleOpenHelpLink(linkId: string) {
    // General links that are part of help & feedback - such as terms & privacy docs
    const utmContent = 'ide-labs-signup';
    vscode.commands.executeCommand(Commands.TRIGGER_HELP_AND_FEEDBACK_LINK, {
      id: linkId,
      utm: { content: utmContent, term: linkId }
    });
  }

  private handleOpenFeedbackLink(featureId: string) {
    // Survey form links for feature feedback
    const url = LABS_FEATURES.find(feature => feature.id === featureId)?.feedbackUrl;
    
    if (url) {
      this.languageClient.labsFeedbackLinkClicked(featureId);
      vscode.commands.executeCommand(Commands.OPEN_BROWSER, vscode.Uri.parse(url));
    }
  }

  private handleOpenLearnMoreLink(featureId: string) {
    const url = LABS_FEATURES.find(feature => feature.id === featureId)?.learnMoreUrl;
    
    if (url) {
      this.languageClient.labsExternalLinkClicked(featureId);
      vscode.commands.executeCommand(Commands.OPEN_BROWSER, vscode.Uri.parse(url));
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    this._resolver = new ResourceResolver(this.extensionContext, webview);
    const templatePath = util.resolveExtensionFile(WEBVIEW_UI_DIR, 'labs.html');
    const template = fs.readFileSync(templatePath.fsPath, 'utf-8');

    const styleSrc = this._resolver.resolve('styles', 'labs.css');
    const canvasConfettiSrc = this._resolver.resolve('node_modules', 'canvas-confetti', 'dist', 'confetti.browser.js');
    const confettiSrc = this._resolver.resolve(WEBVIEW_UI_DIR, 'confetti.js');
    const scriptSrc = this._resolver.resolve(WEBVIEW_UI_DIR, 'labs.js');
    const ideLabsLogoLightSrc = this._resolver.resolve('images', 'labs', 'ide_labs.svg');
    const ideLabsLogoDarkSrc = this._resolver.resolve('images', 'labs', 'ide_labs_dark.svg');

    return template
      .replaceAll('{{cspSource}}', webview.cspSource)
      .replace('{{styleSrc}}', styleSrc)
      .replace('{{canvasConfettiSrc}}', canvasConfettiSrc)
      .replace('{{confettiSrc}}', confettiSrc)
      .replace('{{scriptSrc}}', scriptSrc)
      .replaceAll('{{ideLabsLogoLightSrc}}', ideLabsLogoLightSrc)
      .replaceAll('{{ideLabsLogoDarkSrc}}', ideLabsLogoDarkSrc)
      .replace('{{featureCount}}', LABS_FEATURES.length.toString());
  }
}
