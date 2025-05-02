/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import { Commands } from '../util/commands';

export class GetStartedViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewId = 'SonarQube.GetStarted';

    private readonly _disposables: vscode.Disposable[] = [];

    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
    ) {
        // Listen for theme changes
        this._disposables.push(
            vscode.window.onDidChangeActiveColorTheme(() => {
                if (this._view) {
                    this._view.webview.html = this._getHtmlForWebview(this._view.webview);
                }
            })
        );
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		webviewView.webview.onDidReceiveMessage(data => {
			if (data.command === 'getStartedLinkClicked') {
                vscode.commands.executeCommand(Commands.TRIGGER_HELP_AND_FEEDBACK_LINK, 'sonarLintWalkthrough');
			}
		});
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const isDarkTheme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark;
        
        // Get the proper URI for the images
        const darkImageUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'images', 'SQ_Logo_IDE_Dark Backgrounds.svg'));
        const lightImageUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'images', 'SQ_Logo_IDE_Light Backgrounds.svg'));
		const codiconsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'styles', 'getStarted.css'));
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'webview-ui', 'getStarted.js'));
        
        // Choose the appropriate image based on theme
        const imageUri = isDarkTheme ? darkImageUri : lightImageUri;

        return `<!doctype html><html lang="en">
        <head>
            <meta http-equiv="Content-Type" content="text/html;charset=utf-8" />
            <meta http-equiv="Content-Security-Policy"
                content="default-src 'none'; style-src ${webview.cspSource}; script-src ${webview.cspSource}; img-src ${webview.cspSource}; font-src ${webview.cspSource}"/>
            <link href="${codiconsUri}" rel="stylesheet" />
            <link href="${styleUri}" rel="stylesheet" />
            <script src="${scriptUri}"></script>
        </head>
        <body>
            <img src="${imageUri}" alt="Theme-specific image"/>
            <p>Automatically find and fix code quality and security issues as you write, using powerful linting tools built right into your code editor.</p>
            <a id="getStartedLink" href=#>Get Started with SonarQube for IDE  <i class="codicon codicon-arrow-right"></i></a>
        </body>
        </html>`;
    }

    dispose() {
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}