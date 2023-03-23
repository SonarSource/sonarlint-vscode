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
  diagnosticSeverity,
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
import { sampleFolderLocation } from './commons';
import * as path from 'path';
import { sleep } from '../testutil';

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
    vulnerabilityProbability: HotspotProbability.High,
    riskDescription: 'Answering to this question might require building a huge planet-sized computer',
    vulnerabilityDescription: 'If it is built on the path of a galactic highway, you might never get the answer',
    fixRecommendations: 'Build it somewhere else'
  }
};

const templateHotspotRange = new Selection(
  new Position(templateHotspot.textRange.startLine - 1, templateHotspot.textRange.startLineOffset),
  new Position(templateHotspot.textRange.endLine - 1, templateHotspot.textRange.endLineOffset)
);

function buildHotspot(filePath: string, vulnerabilityProbability: HotspotProbability = HotspotProbability.Medium) {
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
    const scan : (folderUri: vscode.Uri,
                  languageClient: SonarLintExtendedLanguageClient) => Promise<void>  = async (folderUri, _) => {
      scanWasPerformedForFolder = folderUri;
    }
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
    const scan : (folderUri: vscode.Uri,
                  languageClient: SonarLintExtendedLanguageClient) => Promise<void>  = async (folderUri, _) => {
      scanWasPerformedForFolder = folderUri;
    }
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
    const scan : (folderUri: vscode.Uri,
                  languageClient: SonarLintExtendedLanguageClient) => Promise<void>  = async (folderUri, _) => {
      scanWasPerformedForFolder = folderUri;
    }

    await useProvidedFolderOrPickManuallyAndScan(undefined, [], null, scan);
    expect(scanWasPerformedForFolder).to.be.null;

    await useProvidedFolderOrPickManuallyAndScan(undefined, undefined, null, scan);
    expect(scanWasPerformedForFolder).to.be.null;
  });

  suite('diagnosticSeverity', () => {
    test('High probability maps to Error severity', () => {
      assert.strictEqual(diagnosticSeverity(buildHotspot('file', HotspotProbability.High)), HotspotReviewPriority.High);
    });

    test('Medium probability maps to Warning severity', () => {
      assert.strictEqual(
        diagnosticSeverity(buildHotspot('file', HotspotProbability.Medium)),
        HotspotReviewPriority.Medium
      );
    });

    test('Low probability maps to Info severity', () => {
      assert.strictEqual(diagnosticSeverity(buildHotspot('file', HotspotProbability.Low)), HotspotReviewPriority.Low);
    });
  });
});
