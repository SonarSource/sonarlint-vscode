/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import { extensionContext } from '../util/util';

// VS Code shares globalStorageUri across profiles. Only an explicit user action may open the
// profile's MCP file; background inspection and port refresh use the URI resolved in this session.
const remoteMcpConfigUris = new WeakMap<vscode.ExtensionContext, vscode.Uri>();

export function getRemoteMcpConfigUri(): vscode.Uri | undefined {
  return remoteMcpConfigUris.get(extensionContext);
}

export async function openRemoteMcpConfiguration(): Promise<vscode.Uri> {
  remoteMcpConfigUris.delete(extensionContext);
  let openedEditor: vscode.TextEditor | undefined;
  const listener = vscode.window.onDidChangeActiveTextEditor(editor => {
    openedEditor = editor;
  });
  try {
    // This VS Code command resolves the active remote profile, including profiles using the
    // default MCP configuration. It creates mcp.json when needed and opens it in the editor.
    await vscode.commands.executeCommand('workbench.mcp.openRemoteUserMcpJson');
    const document = (openedEditor ?? vscode.window.activeTextEditor)?.document;
    if (!document || !document.uri.path.endsWith('/mcp.json')) {
      throw new Error('Could not resolve the remote MCP configuration.');
    }
    if (document.isDirty) {
      throw new Error('Save the MCP configuration file before configuring SonarQube MCP.');
    }
    remoteMcpConfigUris.set(extensionContext, document.uri);
    return document.uri;
  } finally {
    listener.dispose();
  }
}
