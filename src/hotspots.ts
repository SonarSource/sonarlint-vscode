/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2021 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import { Commands } from './commands';
import { HotspotProbability, RemoteHotspot } from './protocol';

export const HOTSPOT_SOURCE = 'SonarQube Security Hotspot';

export const hotspotsCollection = vscode.languages.createDiagnosticCollection('sonarlint-hotspots');

let activeHotspot: RemoteHotspot;

export const showSecurityHotspot = async (hotspot: RemoteHotspot) => {
  const foundUris = await vscode.workspace.findFiles(`**/${hotspot.filePath}`);
  if (foundUris.length === 0) {
    // TODO Suggest the user to open the right workspace/folder?
    vscode.window.showErrorMessage(`Could not find file '${hotspot.filePath}' in the current workspace`);
  } else if (foundUris.length > 1) {
    // TODO Show quick pick to allow user to select the "right" file
    vscode.window.showErrorMessage(`Multiple candidate files found for '${hotspot.filePath}' in workspace`);
  } else {
    activeHotspot = hotspot;
    const documentUri = foundUris[0];
    const editor = await vscode.window.showTextDocument(documentUri);
    const hotspotDiag = createHotspotDiagnostic(hotspot);
    hotspotsCollection.clear();
    hotspotsCollection.set(documentUri, [hotspotDiag]);

    editor.revealRange(hotspotDiag.range, vscode.TextEditorRevealType.InCenter);
    editor.selection = new vscode.Selection(hotspotDiag.range.start, hotspotDiag.range.end);
  }
};

export const hideSecurityHotspot = () => {
  hotspotsCollection.clear();
  activeHotspot = null;
};

function createHotspotDiagnostic(hotspot: RemoteHotspot) {
  const { startLine, startLineOffset, endLine, endLineOffset } = hotspot.textRange;
  // vscode line positions are 0-based
  const startPosition = new vscode.Position(startLine - 1, startLineOffset);
  const endPosition = new vscode.Position(endLine - 1, endLineOffset);
  const range = new vscode.Range(startPosition, endPosition);

  const hotspotDiag = new vscode.Diagnostic(range, hotspot.message, diagnosticSeverity(hotspot));
  hotspotDiag.code = hotspot.rule.key;
  hotspotDiag.source = HOTSPOT_SOURCE;
  return hotspotDiag;
}

export function diagnosticSeverity(hotspot: RemoteHotspot) {
  switch(hotspot.rule.vulnerabilityProbability) {
    case HotspotProbability.High:
      return vscode.DiagnosticSeverity.Error;
    case HotspotProbability.Low:
      return vscode.DiagnosticSeverity.Information;
    default:
      return vscode.DiagnosticSeverity.Warning;
  }
}

class HotspotsCommand implements vscode.Command {

  arguments: any[];
  command = Commands.HIDE_HOTSPOT;
  title: string;

  constructor(hotspotDiag: vscode.Diagnostic, document: vscode.TextDocument) {
    this.title = `Hide Security Hotspot ${hotspotDiag.code}`;
    this.arguments = [document, hotspotDiag];
  }
}

export class HotspotsCodeActionProvider implements vscode.CodeActionProvider {

  provideCodeActions(document, range, context, token) {
    if (token.isCancellationRequested || !activeHotspot) {
      return [];
    }
    return hotspotsCollection.get(document.uri)
      .filter(d => d.range.intersection(range))
      .map(it => {
        const command = new HotspotsCommand(it, document);
        const hideHotspot = new vscode.CodeAction(command.title, vscode.CodeActionKind.QuickFix);
        hideHotspot.diagnostics = [it];
        hideHotspot.command = command;
        return hideHotspot;
      });
  }
}
