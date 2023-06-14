/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as assert from 'assert';
import * as vscode from 'vscode';
import { Commands } from '../../src/util/commands';
import {
  doChangeHotspotStatus,
  diagnosticSeverity,
  filesCountCheck,
  formatDetectedHotspotStatus,
  showSecurityHotspot,
  useProvidedFolderOrPickManuallyAndScan
} from '../../src/hotspot/hotspots';
import { HotspotProbability, HotspotStatus, RemoteHotspot } from '../../src/lsp/protocol';
import {
  AllHotspotsTreeDataProvider,
  FileGroup,
  HotspotReviewPriority,
  HotspotTreeViewItem
} from '../../src/hotspot/hotspotsTreeDataProvider';
import { Position, Selection } from 'vscode';
import { SonarLintExtendedLanguageClient } from '../../src/lsp/client';
import { expect } from 'chai';
import * as path from 'path';
import { HotspotAnalysisConfirmation } from '../../src/util/showMessage';
import * as protocol from '../../src/lsp/protocol';
import { getWorkspaceFolder } from '../testutil';

const templateHotspot: RemoteHotspot = {
  message: 'Hotspot here!',
  filePath: '',
  textRange: {
    startLine: 1,
    startLineOffset: 9,
    endLine: 1,
    endLineOffset: 12
  },
  author: 'some.one@company.corp',
  status: HotspotStatus.ToReview,
  rule: {
    key: 'java:S4242',
    name: 'Life, The Universe and Everything',
    securityCategory: 'dos',
    vulnerabilityProbability: HotspotProbability.high,
    riskDescription: 'Answering to this question might require building a huge planet-sized computer',
    vulnerabilityDescription: 'If it is built on the path of a galactic highway, you might never get the answer',
    fixRecommendations: 'Build it somewhere else'
  }
};

const templateHotspotRange = new Selection(
  new Position(templateHotspot.textRange.startLine - 1, templateHotspot.textRange.startLineOffset),
  new Position(templateHotspot.textRange.endLine - 1, templateHotspot.textRange.endLineOffset)
);

function buildHotspot(filePath: string, vulnerabilityProbability: HotspotProbability = HotspotProbability.medium) {
  const newHotspot = Object.assign({}, templateHotspot);
  newHotspot.filePath = filePath;
  newHotspot.rule.vulnerabilityProbability = vulnerabilityProbability;
  return newHotspot;
}

const mockAllHotspotsView = {
  reveal(_item, _options) {
    return null;
  }
} as vscode.TreeView<HotspotTreeViewItem>;

const mockHotspotsTreeDataProvider = {
  hasLocalHotspots() {
    return false;
  },

  getAllFilesWithHotspots() {
    return new Map<string, FileGroup>();
  },

  refresh() {
    return null;
  },

  getChildren() {
    return [];
  }
} as AllHotspotsTreeDataProvider;

suite('Hotspots Test Suite', async () => {
  setup(async () => {
    // Make sure workbench is clean before each test
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await vscode.commands.executeCommand(Commands.SHOW_SONARLINT_OUTPUT);
    await vscode.commands.executeCommand('workbench.action.output.toggleOutput');
  });

  test('should show error when no file is found', async () => {
    const hotspot = buildHotspot('not/in/workspace');
    await showSecurityHotspot(mockAllHotspotsView, mockHotspotsTreeDataProvider, hotspot);

    // TODO Find a way to assert error messages?
    assert.strictEqual(vscode.window.activeTextEditor, undefined);
  });

  test('should show hotspot in found file', async () => {
    const hotspot = buildHotspot('main.js');
    await showSecurityHotspot(mockAllHotspotsView, mockHotspotsTreeDataProvider, hotspot);

    assert.notStrictEqual(vscode.window.activeTextEditor, undefined, 'should open main.js in text editor');

    assert.strictEqual(
      vscode.window.activeTextEditor.selection.anchor.line,
      templateHotspotRange.anchor.line,
      'highlighted range start position matches'
    );
    assert.strictEqual(
      vscode.window.activeTextEditor.selection.anchor.character,
      templateHotspotRange.anchor.character,
      'highlighted range start position matches'
    );
    assert.strictEqual(
      vscode.window.activeTextEditor.selection.active.line,
      templateHotspotRange.active.line,
      'highlighted range end position matches'
    );
    assert.strictEqual(
      vscode.window.activeTextEditor.selection.active.character,
      templateHotspotRange.active.character,
      'highlighted range end position matches'
    );
  });

  test('should show hotspot when several files are found', async () => {
    const hotspot = buildHotspot('sample.js');
    await showSecurityHotspot(mockAllHotspotsView, mockHotspotsTreeDataProvider, hotspot);

    assert.notStrictEqual(vscode.window.activeTextEditor, undefined, 'should open first sample.js in text editor');

    assert.strictEqual(
      vscode.window.activeTextEditor.selection.anchor.line,
      templateHotspotRange.anchor.line,
      'highlighted range start position matches'
    );
    assert.strictEqual(
      vscode.window.activeTextEditor.selection.anchor.character,
      templateHotspotRange.anchor.character,
      'highlighted range start position matches'
    );
    assert.strictEqual(
      vscode.window.activeTextEditor.selection.active.line,
      templateHotspotRange.active.line,
      'highlighted range end position matches'
    );
    assert.strictEqual(
      vscode.window.activeTextEditor.selection.active.character,
      templateHotspotRange.active.character,
      'highlighted range end position matches'
    );
  });

  test('should use folder if provided', async () => {
    const sampleFolderUri = vscode.Uri.file(path.join(__dirname, '../../../test/samples'));
    let scanWasPerformedForFolder: vscode.Uri = null;
    const scan: (folderUri: vscode.Uri, languageClient: SonarLintExtendedLanguageClient) => Promise<void> = async (
      folderUri,
      _
    ) => {
      scanWasPerformedForFolder = folderUri;
    };
    const wf = {
      uri: sampleFolderUri,
      name: 'Name',
      index: 0
    };

    await useProvidedFolderOrPickManuallyAndScan(sampleFolderUri, [wf], null, scan);
    expect(scanWasPerformedForFolder.path).to.equal(sampleFolderUri.path);
  });

  test('should use only opened folder if not provided', async () => {
    const sampleFolderUri = vscode.Uri.file(path.join(__dirname, '../../../test/samples'));
    let scanWasPerformedForFolder: vscode.Uri = null;
    const scan: (folderUri: vscode.Uri, languageClient: SonarLintExtendedLanguageClient) => Promise<void> = async (
      folderUri,
      _
    ) => {
      scanWasPerformedForFolder = folderUri;
    };
    const wf = {
      uri: sampleFolderUri,
      name: 'Name',
      index: 0
    };

    await useProvidedFolderOrPickManuallyAndScan(undefined, [wf], null, scan);
    expect(scanWasPerformedForFolder.path).to.equal(sampleFolderUri.path);

    scanWasPerformedForFolder = null;
    // @ts-ignore
    // empty object may be provided for first argument by VSCode runtime
    await useProvidedFolderOrPickManuallyAndScan({}, [wf], null, scan);
    expect(scanWasPerformedForFolder.path).to.equal(sampleFolderUri.path);
  });

  test('should scan nothing if no folder uri provided and no workspace folders opened', async () => {
    let scanWasPerformedForFolder: vscode.Uri = null;
    const scan: (folderUri: vscode.Uri, languageClient: SonarLintExtendedLanguageClient) => Promise<void> = async (
      folderUri,
      _
    ) => {
      scanWasPerformedForFolder = folderUri;
    };

    await useProvidedFolderOrPickManuallyAndScan(undefined, [], null, scan);
    expect(scanWasPerformedForFolder).to.be.null;

    await useProvidedFolderOrPickManuallyAndScan(undefined, undefined, null, scan);
    expect(scanWasPerformedForFolder).to.be.null;
  });

  test('should let to choose form quick pick list if no folder uri provided and more than one workspace folder opened', async () => {
    let scanWasPerformedForFolder: vscode.Uri = null;
    const scan: (folderUri: vscode.Uri, languageClient: SonarLintExtendedLanguageClient) => Promise<void> = async (
      folderUri,
      _
    ) => {
      scanWasPerformedForFolder = folderUri;
    };
    const workspaceFolders = [];
    const workspaceFolder1 = {
      uri: {
        path: '/path1'
      },
      name: 'Name1',
      index: 0
    };
    const workspaceFolder2 = {
      uri: {
        path: '/path2'
      },
      name: 'Name2',
      index: 1
    };
    workspaceFolders.push(workspaceFolder1, workspaceFolder2);
    useProvidedFolderOrPickManuallyAndScan(undefined, workspaceFolders, null, scan);
    await vscode.commands.executeCommand('workbench.action.quickOpenNavigateNext');
    await vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');
    expect(scanWasPerformedForFolder.path).to.equal(workspaceFolder2.uri.path);
  });

  test('should not ask for confirmation if less files than threshold', async () => {
    let confirmationAsked = false;
    const shouldAnalyse = await filesCountCheck(1, () => {
      confirmationAsked = true;
      return Promise.resolve(HotspotAnalysisConfirmation.DONT_ANALYZE);
    });

    expect(confirmationAsked).to.be.false;
    expect(shouldAnalyse).to.be.true;
  });

  test('should ask for confirmation if more files than threshold - reject', async () => {
    let confirmationAsked = false;
    const shouldAnalyse = await filesCountCheck(1001, () => {
      confirmationAsked = true;
      return Promise.resolve(HotspotAnalysisConfirmation.DONT_ANALYZE);
    });

    expect(confirmationAsked).to.be.true;
    expect(shouldAnalyse).to.be.false;
  });

  test('should ask for confirmation if more files than threshold - confirm', async () => {
    let confirmationAsked = false;
    const shouldAnalyse = await filesCountCheck(1001, () => {
      confirmationAsked = true;
      return Promise.resolve(HotspotAnalysisConfirmation.RUN_ANALYSIS);
    });

    expect(confirmationAsked).to.be.true;
    expect(shouldAnalyse).to.be.true;
  });

  suite('diagnosticSeverity', () => {
    test('High probability maps to Error severity', () => {
      assert.strictEqual(diagnosticSeverity(buildHotspot('file', HotspotProbability.high)), HotspotReviewPriority.High);
    });

    test('Medium probability maps to Warning severity', () => {
      assert.strictEqual(
        diagnosticSeverity(buildHotspot('file', HotspotProbability.medium)),
        HotspotReviewPriority.Medium
      );
    });

    test('Low probability maps to Info severity', () => {
      assert.strictEqual(diagnosticSeverity(buildHotspot('file', HotspotProbability.low)), HotspotReviewPriority.Low);
    });

    test('should not change hotspot status when not permitted', ()=>{
      const workspaceFolder = getWorkspaceFolder();
      let changeHotspotStatusBeenCalled = false;
      const fakeLanguageClient = {
        getAllowedHotspotStatuses(hotspotKey: string, folderUri: string,
                                  fileUri: string): Promise<protocol.GetAllowedHotspotStatusesResponse> {
          return Promise.resolve({
            permitted: false,
            notPermittedReason: '',
            allowedStatuses: []
          });
        },
        changeHotspotStatus(hotspotKey: string, newStatus: string, fileUri: string): Promise<void> {
          changeHotspotStatusBeenCalled = true;
          return null;
        }
      } as SonarLintExtendedLanguageClient;

      doChangeHotspotStatus('serverKey',
        '/file/path',
        // @ts-ignore
        workspaceFolder, fakeLanguageClient);

      assert.strictEqual(changeHotspotStatusBeenCalled, false);
    });

    test('should not change hotspot status when server is down', ()=>{
      const workspaceFolder = getWorkspaceFolder();
      let changeHotspotStatusBeenCalled = false;
      const fakeLanguageClient = {
        getAllowedHotspotStatuses(hotspotKey: string, folderUri: string,
                                  fileUri: string): Promise<protocol.GetAllowedHotspotStatusesResponse> {
          return null;
        },
        changeHotspotStatus(hotspotKey: string, newStatus: string, fileUri: string): Promise<void> {
          changeHotspotStatusBeenCalled = true;
          return null;
        }
      } as SonarLintExtendedLanguageClient;

      doChangeHotspotStatus('serverKey',
        '/file/path',
        // @ts-ignore
        workspaceFolder, fakeLanguageClient);

      assert.strictEqual(changeHotspotStatusBeenCalled, false);
    });

    test('should not change hotspot status when no allowed statuses', ()=>{
      const workspaceFolder = getWorkspaceFolder();
      let changeHotspotStatusBeenCalled = false;
      const fakeLanguageClient = {
        getAllowedHotspotStatuses(hotspotKey: string, folderUri: string,
                                  fileUri: string): Promise<protocol.GetAllowedHotspotStatusesResponse> {
          return Promise.resolve({
            permitted: true,
            notPermittedReason: '',
            allowedStatuses: []
          });
        },
        changeHotspotStatus(hotspotKey: string, newStatus: string, fileUri: string): Promise<void> {
          changeHotspotStatusBeenCalled = true;
          return null;
        }
      } as SonarLintExtendedLanguageClient;

      doChangeHotspotStatus('serverKey',
        '/file/path',
        // @ts-ignore
        workspaceFolder, fakeLanguageClient);

      assert.strictEqual(changeHotspotStatusBeenCalled, false);
    });
  });

  suite('formatStatus', () => {
    test('Should correctly format status', () => {
      assert.strictEqual(formatDetectedHotspotStatus(0), 'To review');
      assert.strictEqual(formatDetectedHotspotStatus(1), 'Safe');
      assert.strictEqual(formatDetectedHotspotStatus(2), 'Fixed');
      assert.strictEqual(formatDetectedHotspotStatus(3), 'Acknowledged');
    });
  });
});
