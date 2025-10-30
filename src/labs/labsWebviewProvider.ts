/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

'use strict';

import * as fs from 'fs';
import * as vscode from 'vscode';
import { ResourceResolver } from '../util/webview';
import * as util from '../util/util';
import { LABS_FEATURES } from './labsFeatures';

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
  }


  private _getHtmlForWebview(webview: vscode.Webview): string {
    // Load HTML template
    const templatePath = util.resolveExtensionFile('webview-ui', 'labs.html');
    const template = fs.readFileSync(templatePath.fsPath, 'utf-8');
    
    const resolver = new ResourceResolver(this._extensionContext, webview);
    
    // Resolve resource paths
    const styleSrc = resolver.resolve('styles', 'labs.css');
    const scriptSrc = resolver.resolve('webview-ui', 'labs.js');
    
    // Prepare features with resolved image paths
    const featuresWithImages = LABS_FEATURES.map(feature => ({
      ...feature,
      imageUrl: resolver.resolve('images', feature.imageFile)
    }));
    
    // Replace placeholders in template
    return template
      .replace(/\{\{cspSource\}\}/g, webview.cspSource)
      .replace('{{styleSrc}}', styleSrc)
      .replace('{{scriptSrc}}', scriptSrc)
      .replace('{{featuresJson}}', JSON.stringify(featuresWithImages, null, 2))
      .replace('{{featureCount}}', LABS_FEATURES.length.toString());
  }
}

