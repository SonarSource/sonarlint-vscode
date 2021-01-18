/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2021 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import { RemoteHotspot } from './protocol';

export const HOTSPOT_SOURCE = 'SonarQube Security Hotspot';

const hotspotsCollection = vscode.languages.createDiagnosticCollection('sonarlint-hotspots');

export const showSecurityHotspot = async (hotspot: RemoteHotspot) => {
  const foundUris = await vscode.workspace.findFiles(`**/${hotspot.filePath}`);
  if (foundUris.length === 0) {
    // TODO Suggest the user to open the right workspace/folder?
    vscode.window.showErrorMessage(`Could not find file '${hotspot.filePath}' in the current workspace`);
  } else if (foundUris.length > 1) {
    // TODO Show quick pick to allow user to select the "right" file
    vscode.window.showErrorMessage(`Multiple candidate files found for '${hotspot.filePath}' in workspace`);
  } else {
    const documentUri = foundUris[0];
    const editor = await vscode.window.showTextDocument(documentUri);
    const hotspotDiag = createHotspotDiagnostic(hotspot);

    hotspotsCollection.clear();
    hotspotsCollection.set(documentUri, [ hotspotDiag ]);

    editor.revealRange(hotspotDiag.range, vscode.TextEditorRevealType.InCenter);
    editor.selection = new vscode.Selection(hotspotDiag.range.start, hotspotDiag.range.end);
  }
};

function createHotspotDiagnostic(hotspot: RemoteHotspot) {
  const { startLine, startLineOffset, endLine, endLineOffset } = hotspot.textRange;
  // vscode line positions are 0-based
  const startPosition = new vscode.Position(startLine - 1, startLineOffset);
  const endPosition = new vscode.Position(endLine - 1, endLineOffset);
  const range = new vscode.Range(startPosition, endPosition);

  // TODO Map hotspot severity to diag severity?
  const hotspotDiag = new vscode.Diagnostic(range, hotspot.message, vscode.DiagnosticSeverity.Warning);
  hotspotDiag.code = hotspot.rule.key;
  hotspotDiag.source = HOTSPOT_SOURCE;
  return hotspotDiag;
}
