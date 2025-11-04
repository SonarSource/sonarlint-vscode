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

export class LabsWebviewProvider implements vscode.WebviewViewProvider {
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

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

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
        await IdeLabsFlagManagementService.instance.enableIdeLabs();
        
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

  private _getHtmlForWebview(webview: vscode.Webview): string {
    IdeLabsFlagManagementService.instance.disableIdeLabs();
    // Load HTML template
    const templatePath = util.resolveExtensionFile('webview-ui', 'labs.html');
    const template = fs.readFileSync(templatePath.fsPath, 'utf-8');

    const resolver = new ResourceResolver(this.extensionContext, webview);

    // Resolve resource paths
    const styleSrc = resolver.resolve('styles', 'labs.css');
    const scriptSrc = resolver.resolve('webview-ui', 'labs.js');

    // Prepare features with resolved image paths
    const featuresWithImages = LABS_FEATURES.map(feature => ({
      ...feature,
      imageUrl: resolver.resolve('images', feature.imageFile)
    }));

    // Check if user has already signed up
    const isSignedUp = IdeLabsFlagManagementService.instance.isIdeLabsEnabled();

    // Replace placeholders in template
    return template
      .replaceAll('{{cspSource}}', webview.cspSource)
      .replace('{{styleSrc}}', styleSrc)
      .replace('{{scriptSrc}}', scriptSrc)
      .replace('{{featuresJson}}', JSON.stringify(featuresWithImages, null, 2))
      .replace('{{featureCount}}', LABS_FEATURES.length.toString())
      .replace('{{isSignedUp}}', isSignedUp.toString());
  }
}
