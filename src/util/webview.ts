/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import { resolveExtensionFile } from './util';

/*
 * Utility class to load "external" resources from extension folder.
 * See Content-Security-Policy header in HTML.
 */
export class ResourceResolver {
  constructor(private readonly context: vscode.ExtensionContext, private readonly webview: vscode.Webview) {}

  resolve(...segments: Array<string>) {
    return this.webview.asWebviewUri(resolveExtensionFile(...segments))
      .toString();
  }
}

const entityMap = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;'
};

export function escapeHtml(str: string) {
  return String(str).replace(/[&<>"'\/`=]/g, function (s) {
    return entityMap[s];
  });
}

export function clean(str: string) {
  return capitalizeName(str.toLowerCase().split('_').join(' '));
}

export function capitalizeName(name: string) {
  return name.replace(/\b(\w)/g, s => s.toUpperCase());
}
