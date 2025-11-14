/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import { isValidRange, SINGLE_LOCATION_DECORATION } from '../location/locations';
import { SonarLintExtendedLanguageClient } from '../lsp/client';
import { AnalysisFile, ExtendedClient, ShowRuleDescriptionParams } from '../lsp/protocol';
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
import { FindingsTreeDataProvider, FindingsTreeViewItem } from '../findings/findingsTreeDataProvider';
import { HotspotNode, HotspotReviewPriority } from '../findings/findingTypes/hotspotNode';

export const HOTSPOTS_VIEW_ID = 'SonarLint.SecurityHotspots';

export const OPEN_HOTSPOT_IN_IDE_SOURCE = 'openInIde';

const FILE_COUNT_LIMIT_FOR_FULL_PROJECT_ANALYSIS = 1000;
let activeHotspot: ExtendedClient.RemoteHotspot;
let hotspotDescriptionPanel: vscode.WebviewPanel;
let hotspotDetailsPanel: vscode.WebviewPanel;

export const showSecurityHotspot = async (
  allFindingsView: vscode.TreeView<FindingsTreeViewItem>,
  findingsTreeDataProvider: FindingsTreeDataProvider,
  remoteHotspot?: ExtendedClient.RemoteHotspot
) => {
  const foundUris = await vscode.workspace.findFiles(`**/${remoteHotspot.ideFilePath}`);
  if (foundUris.length === 0) {
    handleFileForHotspotNotFound(remoteHotspot);
  } else {
    const documentUri = foundUris[0];
    if (foundUris.length > 1) {
      verboseLogToSonarLintOutput(
        `Multiple candidates found for '${remoteHotspot.ideFilePath}', using first match '${documentUri}'`
      );
    }
    const editor = await vscode.window.showTextDocument(documentUri);
    activeHotspot = remoteHotspot;
    await revealFileInTreeView(remoteHotspot, allFindingsView, findingsTreeDataProvider);
    await highlightLocation(editor);
    vscode.commands.executeCommand(Commands.SHOW_HOTSPOT_DESCRIPTION);
  }
};

function handleFileForHotspotNotFound(hotspot : ExtendedClient.RemoteHotspot) {
  vscode.window
    .showErrorMessage(
      `Could not find file '${hotspot.ideFilePath}' in the current workspace.
Please make sure that the right folder is open and bound to the right project on the server,
 and that the file has not been removed or renamed.`,
      'Show Documentation'
    )
    .then(action => {
      if (action === 'Show Documentation') {
        vscode.commands.executeCommand(
          Commands.OPEN_BROWSER,
          vscode.Uri.parse('https://docs.sonarsource.com/sonarqube-server/user-guide/security-hotspots/')
        );
      }
    });
}

async function revealFileInTreeView(
  hotspot: ExtendedClient.RemoteHotspot,
  allFindingsView: vscode.TreeView<FindingsTreeViewItem>,
  findingsTreeDataProvider: FindingsTreeDataProvider
) {
  const fileUri = getUriFromRelativePath(hotspot.ideFilePath, vscode.workspace.workspaceFolders[0]);
  const rootFiles = await findingsTreeDataProvider.getRootFiles();
  const fileToHighlight = rootFiles.find(fileNode => fileNode.fileUri === fileUri);
  allFindingsView.reveal(fileToHighlight, { focus: true });
}

export function diagnosticSeverity(hotspot: ExtendedClient.RemoteHotspot) {
  switch (hotspot.rule.vulnerabilityProbability) {
    case ExtendedClient.HotspotProbability.high:
      return HotspotReviewPriority.High;
    case ExtendedClient.HotspotProbability.low:
      return HotspotReviewPriority.Low;
    default:
      return HotspotReviewPriority.Medium;
  }
}

export const showHotspotDescription = () => {
  if (!hotspotDescriptionPanel) {
    hotspotDescriptionPanel = vscode.window.createWebviewPanel(
      'sonarlint.DiagContext',
      'SonarQube Server Security Hotspot',
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
    activeHotspot.status,
    activeHotspot.message,
    activeHotspot.rule,
    false,
    hotspotDescriptionPanel.webview
  );
  hotspotDescriptionPanel.iconPath = {
    light: resolveExtensionFile('images/sonarqube server.svg'),
    dark: resolveExtensionFile('images/sonarqube server_dark.svg')
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
  if (!folderUri?.path) {
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
  return statusIndex === ExtendedClient.ExtendedHotspotStatus.ToReview ? 'To review' : ExtendedClient.ExtendedHotspotStatus[statusIndex].toString();
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
    light: resolveExtensionFile('images/sonarqube_for_ide.svg'),
    dark: resolveExtensionFile('images/sonarqube_for_ide_dark.svg')
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
