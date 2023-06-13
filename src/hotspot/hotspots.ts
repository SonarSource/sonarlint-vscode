/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import { isValidRange, SINGLE_LOCATION_DECORATION } from '../location/locations';
import { SonarLintExtendedLanguageClient } from '../lsp/client';
import {
  AnalysisFile,
  Diagnostic,
  ExtendedHotspotStatus,
  HotspotProbability,
  HotspotStatus,
  RemoteHotspot,
  ShowRuleDescriptionParams
} from '../lsp/protocol';
import { filterIgnored, filterOutScmIgnoredFiles } from '../scm/scm';
import { Commands } from '../util/commands';
import { verboseLogToSonarLintOutput } from '../util/logging';
import {
  HotspotAnalysisConfirmation,
  notCompatibleServerWarning,
  noWorkspaceFolderToScanMessage,
  showChangeStatusConfirmationDialog,
  tooManyFilesConfirmation
} from '../util/showMessage';
import { code2ProtocolConverter, getUriFromRelativePath } from '../util/uri';
import {
  createAnalysisFilesFromFileUris,
  findFilesInFolder,
  getFilesMatchedGlobPatterns,
  getFilesNotMatchedGlobPatterns,
  getIdeFileExclusions,
  getQuickPickListItemsForWorkspaceFolders,
  resolveExtensionFile
} from '../util/util';
import { computeHotspotContextPanelContent } from './hotspotContextPanel';
import {
  AllHotspotsTreeDataProvider,
  HotspotNode,
  HotspotReviewPriority,
  HotspotTreeViewItem
} from './hotspotsTreeDataProvider';

export const HOTSPOTS_VIEW_ID = 'SonarLint.SecurityHotspots';

export const OPEN_HOTSPOT_IN_IDE_SOURCE = 'openInIde';

const FILE_COUNT_LIMIT_FOR_FULL_PROJECT_ANALYSIS = 1000;
let activeHotspot: RemoteHotspot;
let hotspotDescriptionPanel: vscode.WebviewPanel;
let hotspotDetailsPanel: vscode.WebviewPanel;

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
      verboseLogToSonarLintOutput(
        `Multiple candidates found for '${hotspot.filePath}', using first match '${documentUri}'`
      );
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
    case HotspotProbability.high:
      return HotspotReviewPriority.High;
    case HotspotProbability.low:
      return HotspotReviewPriority.Low;
    default:
      return HotspotReviewPriority.Medium;
  }
}

function formatRemoteHotspotStatus(status: HotspotStatus) {
  return status === HotspotStatus.ToReview ? 'To review' : 'Reviewed';
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
  hotspotDescriptionPanel.webview.html = computeHotspotContextPanelContent(
    activeHotspot.rule.securityCategory,
    activeHotspot.rule.vulnerabilityProbability,
    activeHotspot.author,
    formatRemoteHotspotStatus(activeHotspot.status),
    activeHotspot.message,
    activeHotspot.rule,
    false,
    hotspotDescriptionPanel.webview
  );
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

export async function getFilesForHotspotsAndLaunchScan(
  folderUri: vscode.Uri,
  languageClient: SonarLintExtendedLanguageClient
): Promise<void> {
  const response = await languageClient.getFilePatternsForAnalysis(folderUri.path);
  return vscode.window.withProgress(
    { title: 'Preparing Files to Scan', location: { viewId: HOTSPOTS_VIEW_ID }, cancellable: true },
    async (progress, cancelToken) => {
      const checkLocalDetectionResponse = await languageClient.checkLocalHotspotsDetectionSupported(
        code2ProtocolConverter(folderUri)
      );
      if (!checkLocalDetectionResponse.isSupported) {
        notCompatibleServerWarning(folderUri.path, checkLocalDetectionResponse.reason);
        return;
      }
      const files = await getFilesForHotspotsScan(folderUri, response.patterns, progress, cancelToken);
      if (cancelToken.isCancellationRequested) {
        return;
      }
      launchScanForHotspots(languageClient, folderUri, files);
      progress.report({ increment: 100 });
    }
  );
}

export async function useProvidedFolderOrPickManuallyAndScan(
  folderUri: vscode.Uri,
  workspaceFolders: readonly vscode.WorkspaceFolder[],
  languageClient: SonarLintExtendedLanguageClient,
  scan: (folderUri: vscode.Uri, languageClient: SonarLintExtendedLanguageClient) => Promise<void>
) {
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
        workspaceFoldersQuickPick.dispose();
        await scan(folderUri, languageClient);
      });
      workspaceFoldersQuickPick.show();
    }
  } else {
    await scan(folderUri, languageClient);
  }
}

function launchScanForHotspots(
  languageClient: SonarLintExtendedLanguageClient,
  folderUri: vscode.Uri,
  filesForHotspotsAnalysis: AnalysisFile[]
) {
  languageClient.scanFolderForHotspots({
    folderUri: code2ProtocolConverter(folderUri),
    documents: filesForHotspotsAnalysis
  });
}

export async function filesCountCheck(
  filesCount: number,
  confirmation: (filesCount: number) => Promise<HotspotAnalysisConfirmation>
): Promise<boolean> {
  if (filesCount > FILE_COUNT_LIMIT_FOR_FULL_PROJECT_ANALYSIS) {
    const action = await confirmation(filesCount);
    if (action === HotspotAnalysisConfirmation.DONT_ANALYZE) {
      return false;
    }
  }
  return true;
}

export async function getFilesForHotspotsScan(
  folderUri: vscode.Uri,
  globPatterns: string[],
  progress: vscode.Progress<{
    message?: string;
    increment?: number;
  }>,
  cancelToken: vscode.CancellationToken
): Promise<AnalysisFile[]> {
  const workspaceFolderConfig = vscode.workspace.getConfiguration(null, folderUri);
  const excludes = workspaceFolderConfig.files.exclude;
  const allFiles = await findFilesInFolder(folderUri, cancelToken);
  if (cancelToken.isCancellationRequested) {
    return [];
  }
  const excludedInIdeGlobPatterns = getIdeFileExclusions(excludes);
  const notExcludedFiles = getFilesNotMatchedGlobPatterns(allFiles, excludedInIdeGlobPatterns);
  const filesWithKnownSuffixes = getFilesMatchedGlobPatterns(notExcludedFiles, globPatterns);
  if (cancelToken.isCancellationRequested) {
    return [];
  }
  const notIgnoredFiles = await filterOutScmIgnoredFiles(filesWithKnownSuffixes, filterIgnored);
  if (cancelToken.isCancellationRequested) {
    return [];
  }
  const shouldAnalyze = await filesCountCheck(notIgnoredFiles.length, tooManyFilesConfirmation);
  if (!shouldAnalyze) {
    return [];
  }
  if (cancelToken.isCancellationRequested) {
    return [];
  }
  if (cancelToken.isCancellationRequested) {
    return [];
  }
  return await createAnalysisFilesFromFileUris(notIgnoredFiles, vscode.workspace.textDocuments, progress, cancelToken);
}

export function formatDetectedHotspotStatus(statusIndex: number) {
  return statusIndex === ExtendedHotspotStatus.ToReview ? 'To review' : ExtendedHotspotStatus[statusIndex].toString();
}

export function showHotspotDetails(hotspotDetails: ShowRuleDescriptionParams, hotspot: HotspotNode) {
  if (!hotspotDetailsPanel) {
    hotspotDetailsPanel = vscode.window.createWebviewPanel(
      'sonarlint.DiagContext',
      'Security Hotspot Details',
      vscode.ViewColumn.Two,
      {
        enableScripts: false
      }
    );
    hotspotDetailsPanel.onDidDispose(() => {
      hotspotDetailsPanel = undefined;
    }, null);
  }

  hotspotDetailsPanel.webview.html = computeHotspotContextPanelContent(
    '',
    HotspotReviewPriority[hotspot.vulnerabilityProbability],
    '',
    formatDetectedHotspotStatus(hotspot.status),
    hotspot.message,
    hotspotDetails,
    true,
    hotspotDetailsPanel.webview
  );

  hotspotDetailsPanel.iconPath = {
    light: resolveExtensionFile('images/sonarlint.svg'),
    dark: resolveExtensionFile('images/sonarlint.svg')
  };

  hotspotDetailsPanel.reveal();
}

export async function changeHotspotStatus(hotspotServerKey: string, fileUriAsSting: string,
                                                  languageClient: SonarLintExtendedLanguageClient) {
  const fileUri = vscode.Uri.parse(fileUriAsSting);
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileUri);
  doChangeHotspotStatus(hotspotServerKey, fileUriAsSting, workspaceFolder, languageClient);
}

// visible for testing
export async function doChangeHotspotStatus(hotspotServerKey: string, fileUriAsSting: string,
                                            workspaceFolder:vscode.WorkspaceFolder,
                                            languageClient: SonarLintExtendedLanguageClient) {
  const allowedHotspotStatuses =
    await languageClient.getAllowedHotspotStatuses(hotspotServerKey, workspaceFolder.uri.toString(), fileUriAsSting);
  if (allowedHotspotStatuses == null) {
    return;
  }
  if (!allowedHotspotStatuses.permitted) {
    vscode.window.showWarningMessage(
      `Not permitted to change hotspot status. Reason: ${allowedHotspotStatuses.notPermittedReason}`);
    return;
  }
  if (allowedHotspotStatuses.allowedStatuses.length === 0) {
    vscode.window.showInformationMessage(
      `There are no allowed statuses to set for this hotspot`);
    return;
  }
  const statusQuickPickItems = allowedHotspotStatuses.allowedStatuses;
  const chosenStatus = await vscode.window.showQuickPick(statusQuickPickItems, {
    title: 'Change hotspot status',
    placeHolder: 'Choose a status for the hotspot'
  });
  if (chosenStatus) {
    showChangeStatusConfirmationDialog('hotspot').then(async answer => {
      if (answer === 'Yes') {
        languageClient.changeHotspotStatus(hotspotServerKey, chosenStatus, fileUriAsSting);
      }
    });
  }
}
