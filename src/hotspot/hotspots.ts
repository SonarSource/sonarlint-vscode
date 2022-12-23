/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import { Commands } from '../util/commands';
import { logToSonarLintOutput } from '../extension';
import { computeHotspotContextPanelContent } from './hotspotContextPanel';
import { Diagnostic, HotspotProbability, RemoteHotspot } from '../lsp/protocol';
import { resolveExtensionFile } from '../util/util';
import {
  AllHotspotsTreeDataProvider,
  HotspotNode,
  HotspotReviewPriority,
  HotspotTreeViewItem
} from './hotspotsTreeDataProvider';
import { getFullPathFromRelativePath } from '../util/uri';

export const HOTSPOT_SOURCE = 'SonarQube Security Hotspot';
export const OPEN_HOTSPOT_IN_IDE_SOURCE = 'openInIde';

let activeHotspot: RemoteHotspot;
let hotspotDescriptionPanel: vscode.WebviewPanel;

export const showSecurityHotspot = async (
  allHotspotsView: vscode.TreeView<HotspotTreeViewItem>,
  hotspotsTreeDataProvider: AllHotspotsTreeDataProvider,
  remoteHotspot?: RemoteHotspot
) => {
  const hotspot = remoteHotspot ? remoteHotspot : activeHotspot;
  const foundUris = await vscode.workspace.findFiles(`**/${hotspot.filePath}`);
  if (foundUris.length === 0) {
    vscode.window
      .showErrorMessage(
        `Could not find file '${hotspot.filePath}' in the current workspace.

Please make sure that the right folder is open and bound to the right project on the server,
 and that the file has not been removed or renamed.`,
        'Show Documentation'
      )
      .then(action => {
        if (action === 'Show Documentation') {
          vscode.commands.executeCommand(
            Commands.OPEN_BROWSER,
            vscode.Uri.parse('https://docs.sonarqube.org/latest/user-guide/security-hotspots/')
          );
        }
      });
  } else {
    activeHotspot = hotspot ? hotspot : activeHotspot;
    const documentUri = foundUris[0];
    if (foundUris.length > 1) {
      logToSonarLintOutput(`Multiple candidates found for '${hotspot.filePath}', using first match '${documentUri}'`);
    }
    const editor = await vscode.window.showTextDocument(documentUri);
    if (hotspot instanceof HotspotNode) {
      await highlightLocation(editor);
    } else {
      const hotspotDiag = createHotspotDiagnostic(hotspot, allHotspotsView, hotspotsTreeDataProvider);

      editor.revealRange(
        new vscode.Range(
          hotspotDiag.range.start.line,
          hotspotDiag.range.start.character,
          hotspotDiag.range.end.line,
          hotspotDiag.range.end.character
        ),
        vscode.TextEditorRevealType.InCenter
      );
      editor.selection = new vscode.Selection(
        new vscode.Position(hotspotDiag.range.start.line, hotspotDiag.range.start.character),
        new vscode.Position(hotspotDiag.range.end.line, hotspotDiag.range.end.character)
      );
    }
    vscode.commands.executeCommand(Commands.SHOW_HOTSPOT_DESCRIPTION);
  }
};

export const hideSecurityHotspot = (hotspotsTreeDataProvider: AllHotspotsTreeDataProvider) => {
  activeHotspot = null;
  if (hotspotDescriptionPanel) {
    hotspotDescriptionPanel.dispose();
  }
  hotspotsTreeDataProvider.fileHotspotsCache = new Map<string, Diagnostic[]>();
  hotspotsTreeDataProvider.refresh();
};

function createHotspotDiagnostic(
  hotspot: RemoteHotspot,
  allHotspotsView: vscode.TreeView<HotspotTreeViewItem>,
  hotspotsTreeDataProvider: AllHotspotsTreeDataProvider
) {
  const { startLine, startLineOffset, endLine, endLineOffset } = hotspot.textRange;
  // vscode line positions are 0-based
  const start = new vscode.Position(startLine - 1, startLineOffset);
  const end = { line: endLine - 1, character: endLineOffset };
  const range = { start, end };

  const hotspotDiag = {
    range,
    severity: diagnosticSeverity(hotspot),
    message: hotspot.message,
    code: hotspot.rule.key,
    source: OPEN_HOTSPOT_IN_IDE_SOURCE,
    flows: [],
    data: {
      hotspotKey: 'remoteHotspotKey'
    }
  } as Diagnostic;
  let fileToHighlight = null;
  if (hotspotsTreeDataProvider.hasLocalHotspots() && activeHotspot === null) {
    fileToHighlight = hotspotsTreeDataProvider.getAllFilesWithHotspots().get(hotspot.filePath);
  } else {
    // reset local cache before opening each hotspot
    hotspotsTreeDataProvider.fileHotspotsCache = new Map<string, Diagnostic[]>();
    const fullHotspotPath = getFullPathFromRelativePath(hotspot.filePath, vscode.workspace.workspaceFolders[0]);
    hotspotsTreeDataProvider.fileHotspotsCache.set(
      getFullPathFromRelativePath(hotspot.filePath, vscode.workspace.workspaceFolders[0]),
      [hotspotDiag]
    );
    fileToHighlight = hotspotsTreeDataProvider.getAllFilesWithHotspots().get(fullHotspotPath);
    hotspotsTreeDataProvider.refresh();
  }
  allHotspotsView.reveal(fileToHighlight, { focus: true });

  return hotspotDiag;
}

export function diagnosticSeverity(hotspot: RemoteHotspot) {
  switch (hotspot.rule.vulnerabilityProbability) {
    case HotspotProbability.High:
      return HotspotReviewPriority.High;
    case HotspotProbability.Low:
      return HotspotReviewPriority.Low;
    default:
      return HotspotReviewPriority.Medium;
  }
}

export const showHotspotDescription = () => {
  if (!hotspotDescriptionPanel) {
    hotspotDescriptionPanel = vscode.window.createWebviewPanel(
      'sonarlint.DiagContext',
      'SonarQube Security Hotspot',
      vscode.ViewColumn.Two,
      {
        enableScripts: false
      }
    );
    hotspotDescriptionPanel.onDidDispose(() => {
      hotspotDescriptionPanel = undefined;
    }, null);
  }
  const diagContextPanelContent = computeHotspotContextPanelContent(activeHotspot, hotspotDescriptionPanel.webview);
  hotspotDescriptionPanel.webview.html = diagContextPanelContent;
  hotspotDescriptionPanel.iconPath = {
    light: resolveExtensionFile('images/sonarqube.svg'),
    dark: resolveExtensionFile('images/sonarqube.svg')
  };
  hotspotDescriptionPanel.reveal();
};

export const highlightLocation = async editor => {
  editor.revealRange(
    new vscode.Range(
      activeHotspot.textRange.startLine,
      activeHotspot.textRange.startLineOffset,
      activeHotspot.textRange.endLine,
      activeHotspot.textRange.endLineOffset
    ),
    vscode.TextEditorRevealType.InCenter
  );
  editor.selection = new vscode.Selection(
    new vscode.Position(activeHotspot.textRange.startLine, activeHotspot.textRange.startLineOffset),
    new vscode.Position(activeHotspot.textRange.endLine, activeHotspot.textRange.endLineOffset)
  );
};
