/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import { Commands } from '../util/commands';
import { computeHotspotContextPanelContent } from './hotspotContextPanel';
import { AnalysisFile, Diagnostic, HotspotProbability, RemoteHotspot } from '../lsp/protocol';
import { logToSonarLintOutput } from '../util/logging';
import {
  createAnalysisFilesFromFileUris,
  resolveExtensionFile,
  getQuickPickListItemsForWorkspaceFolders,
  findFilesExceptInIgnoredFolders, findSubFoldersInFolder
} from '../util/util';
import {
  AllHotspotsTreeDataProvider,
  HotspotNode,
  HotspotReviewPriority,
  HotspotTreeViewItem
} from './hotspotsTreeDataProvider';
import { code2ProtocolConverter, getUriFromRelativePath } from '../util/uri';
import { isValidRange, SINGLE_LOCATION_DECORATION } from '../location/locations';
import { SonarLintExtendedLanguageClient } from '../lsp/client';
import { noWorkspaceFolderToScanMessage, projectIsTooBigToScanForHotspots } from '../util/showMessage';
import { filterIgnored, filterOutScmIgnoredFiles } from '../scm/scm';
import { performance } from 'perf_hooks';

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
    handleFileForHotspotNotFound(hotspot);
  } else {
    const documentUri = foundUris[0];
    if (foundUris.length > 1) {
      logToSonarLintOutput(`Multiple candidates found for '${hotspot.filePath}', using first match '${documentUri}'`);
    }
    const editor = await vscode.window.showTextDocument(documentUri);
    if (hotspot instanceof HotspotNode) {
      activeHotspot = hotspot ? hotspot : activeHotspot;
      await highlightLocation(editor);
    } else {
      revealHotspotInTreeView(hotspot, allHotspotsView, hotspotsTreeDataProvider);
      activeHotspot = hotspot ? hotspot : activeHotspot;
      await highlightLocation(editor);
    }
    vscode.commands.executeCommand(Commands.SHOW_HOTSPOT_DESCRIPTION);
  }
};

function handleFileForHotspotNotFound(hotspot) {
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
}

export const hideSecurityHotspot = (hotspotsTreeDataProvider: AllHotspotsTreeDataProvider) => {
  if (hotspotDescriptionPanel) {
    hotspotDescriptionPanel.dispose();
  }
  if (!hotspotsTreeDataProvider.hasLocalHotspots()) {
    hotspotsTreeDataProvider.fileHotspotsCache = new Map<string, Diagnostic[]>();
  }
  activeHotspot = null;
  hotspotsTreeDataProvider.refresh();
};

function revealHotspotInTreeView(
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
    data: 'remoteHotspotKey'
  } as Diagnostic;
  let fileToHighlight;
  if (hotspotsTreeDataProvider.hasLocalHotspots()) {
    fileToHighlight = hotspotsTreeDataProvider.getAllFilesWithHotspots().get(hotspot.filePath);
  } else {
    // reset local cache before opening each hotspot
    hotspotsTreeDataProvider.fileHotspotsCache = new Map<string, Diagnostic[]>();
    const hotspotUri = getUriFromRelativePath(hotspot.filePath, vscode.workspace.workspaceFolders[0]);
    hotspotsTreeDataProvider.fileHotspotsCache.set(hotspotUri, [hotspotDiag]);
    fileToHighlight = hotspotsTreeDataProvider.getAllFilesWithHotspots().get(hotspot.filePath);
    hotspotsTreeDataProvider.refresh();
  }
  const knownHotspotGroup = hotspotsTreeDataProvider.getChildren(fileToHighlight).find(g => {
    return g.contextValue === 'knownHotspotsGroup';
  });
  const hotspotToHighlight = hotspotsTreeDataProvider.getChildren(knownHotspotGroup).find(h => {
    return h.label === hotspot.message;
  });
  allHotspotsView.reveal(hotspotToHighlight, { focus: true });
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
  hotspotDescriptionPanel.webview.html =
    computeHotspotContextPanelContent(activeHotspot, hotspotDescriptionPanel.webview);
  hotspotDescriptionPanel.iconPath = {
    light: resolveExtensionFile('images/sonarqube.svg'),
    dark: resolveExtensionFile('images/sonarqube.svg')
  };
  hotspotDescriptionPanel.reveal();
};

export const highlightLocation = async editor => {
  const startPosition = new vscode.Position(
    activeHotspot.textRange.startLine - 1,
    activeHotspot.textRange.startLineOffset
  );
  const endPosition = new vscode.Position(activeHotspot.textRange.endLine - 1, activeHotspot.textRange.endLineOffset);
  const vscodeRange = new vscode.Range(startPosition, endPosition);
  editor.revealRange(vscodeRange, vscode.TextEditorRevealType.InCenter);
  editor.selection = new vscode.Selection(startPosition, endPosition);
  if (isValidRange(vscodeRange, editor.document)) {
    editor.setDecorations(SINGLE_LOCATION_DECORATION, [vscodeRange]);
  }
};

export async function getFilesForHotspotsAndLaunchScan(folderUri: vscode.Uri,
                                                languageClient: SonarLintExtendedLanguageClient): Promise<void> {
  const files = await getFilesForHotspotsScan(folderUri);

  launchScanForHotspots(languageClient, folderUri, files);
}

export async function useProvidedFolderOrPickManuallyAndScan(
  folderUri: vscode.Uri,
  workspaceFolders: readonly vscode.WorkspaceFolder[],
  languageClient: SonarLintExtendedLanguageClient,
  scan: (folderUri: vscode.Uri,
         languageClient: SonarLintExtendedLanguageClient) => Promise<void>) {
  if (!folderUri || !folderUri.path) {
    if (!workspaceFolders || workspaceFolders.length === 0) {
      noWorkspaceFolderToScanMessage();
      return;
    }
    if (workspaceFolders.length === 1) {
      folderUri = workspaceFolders[0].uri;
      await scan(folderUri, languageClient);
    } else {
      const quickPickItems = getQuickPickListItemsForWorkspaceFolders(workspaceFolders);
      const workspaceFoldersQuickPick = vscode.window.createQuickPick();
      workspaceFoldersQuickPick.title = `Select Workspace Folder to scan for Hotspots`;
      workspaceFoldersQuickPick.placeholder = `Select Workspace Folder to scan for Hotspots`;
      workspaceFoldersQuickPick.items = quickPickItems;
      workspaceFoldersQuickPick.ignoreFocusOut = true;
      workspaceFoldersQuickPick.onDidChangeSelection(async selection => {
        folderUri = vscode.Uri.parse(selection[0].description);
        await scan(folderUri, languageClient);
        workspaceFoldersQuickPick.dispose();
      });
      workspaceFoldersQuickPick.show();
    }
  } else {
    await scan(folderUri, languageClient);
  }
}


function launchScanForHotspots(languageClient: SonarLintExtendedLanguageClient,
                               folderUri: vscode.Uri, filesForHotspotsAnalysis: AnalysisFile[]) {
  languageClient.scanFolderForHotspots(
    {
      folderUri: code2ProtocolConverter(folderUri),
      documents: filesForHotspotsAnalysis
    }
  );
}

export async function getFilesForHotspotsScan(folderUri: vscode.Uri): Promise<AnalysisFile[]> {
  const subFolders = await findSubFoldersInFolder(folderUri, new Set<vscode.Uri>());
  const notIgnoredSubFolderUris = await filterOutScmIgnoredFiles(Array.from(subFolders), filterIgnored);
  const notIgnoredSubFolderPaths = notIgnoredSubFolderUris.map(uri => uri.path);
  const allFilesExceptIgnoredFolders = await findFilesExceptInIgnoredFolders(
    folderUri, new Set(notIgnoredSubFolderPaths));
  const notIgnoredFiles = await filterOutScmIgnoredFiles(allFilesExceptIgnoredFolders, filterIgnored);
  if (notIgnoredFiles.length > 1000 ) {
    projectIsTooBigToScanForHotspots();
    return [];
  }
  const openDocuments = vscode.window.visibleTextEditors.map(e => e.document);
  return await createAnalysisFilesFromFileUris(notIgnoredFiles, openDocuments);
}
