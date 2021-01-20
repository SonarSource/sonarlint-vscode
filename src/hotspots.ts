/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2021 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import { RemoteHotspot } from './protocol';
import { Commands } from './commands';
import HIDE_HOTSPOT = Commands.HIDE_HOTSPOT;

export const HOTSPOT_SOURCE = 'SonarQube Security Hotspot';

const hotspotsCollection = vscode.languages.createDiagnosticCollection('sonarlint-hotspots');

class OpenHotspotsCache {
  internalHotspotsCache = new Map<vscode.TextDocument, Set<vscode.Diagnostic>>();

  add(document: vscode.TextDocument, hotspot: vscode.Diagnostic) {
    if (!this.internalHotspotsCache.has(document)) {
      this.internalHotspotsCache.set(document, new Set());
    }
    this.internalHotspotsCache.get(document).add(hotspot);
  }

  remove(document: vscode.TextDocument, hotspot: vscode.Diagnostic) {
    if (this.internalHotspotsCache.has(document)) {
      this.internalHotspotsCache.get(document).delete(hotspot);
    }
  }

  getHotspots(document: vscode.TextDocument, range: vscode.Range): Array<vscode.Diagnostic> {
    if (this.internalHotspotsCache.has(document)) {
      const hotspotsInRange = [];
      this.internalHotspotsCache.get(document).forEach(it => {
        if (it.range.intersection(range)) {
          hotspotsInRange.push(it);
        }
      });
      return hotspotsInRange;
    }
    return [];
  }
}

export const openHotspotsCache = new OpenHotspotsCache();

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
    openHotspotsCache.add(editor.document, hotspotDiag);

    hotspotsCollection.clear();
    hotspotsCollection.set(documentUri, [hotspotDiag]);
    vscode.languages.registerCodeActionsProvider({ scheme: 'file' }, new HotspotsCodeActionProvider(), { providedCodeActionKinds: [vscode.CodeActionKind.Empty] });
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

class HotspotsCommand implements vscode.Command {

  arguments: any[];
  command = HIDE_HOTSPOT;
  title: string;
  tooltip: string;

  constructor(title: string, tooltip: string, document: vscode.TextDocument, hotspotDiag: vscode.Diagnostic) {
    this.title = title;
    this.tooltip = tooltip;
    this.arguments = [document, hotspotDiag];
  }
}

class HotspotsCodeActionProvider implements vscode.CodeActionProvider {

  provideCodeActions(document, range, context, token): vscode.ProviderResult<(vscode.Command | vscode.CodeAction)[]> {
    let hotspots = openHotspotsCache.getHotspots(document, range);
    return hotspots.map(it => new HotspotsCommand(`Hide hotspots: ${it.code}`, 'Tooltip', document, it));
  }

}
