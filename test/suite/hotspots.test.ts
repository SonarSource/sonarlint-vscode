/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2021 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as assert from 'assert';
import * as vscode from 'vscode';
import { Commands } from '../../src/commands';
import { diagnosticSeverity, HOTSPOT_SOURCE, showSecurityHotspot } from '../../src/hotspots';
import { HotspotProbability, HotspotStatus, RemoteHotspot } from '../../src/protocol';

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

function buildHotspot(
    filePath: string,
    vulnerabilityProbability: HotspotProbability = HotspotProbability.Medium
) {
  const newHotspot = Object.assign({}, templateHotspot);
  newHotspot.filePath = filePath;
  newHotspot.rule.vulnerabilityProbability = vulnerabilityProbability;
  return newHotspot;
}

function getHotspotsInCurrentEditor() {
  return vscode.languages.getDiagnostics(vscode.window.activeTextEditor.document.uri)
    .filter(d => d.source === HOTSPOT_SOURCE);
}

suite('Hotspots Test Suite', async () => {

  suiteSetup(async () => {
    // Make sure workbench is clean before tests
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  test('should show error when no file is found', async () => {

    const hotspot = buildHotspot('not/in/workspace');
    await showSecurityHotspot(hotspot);

    // TODO Find a way to assert error messages?
    assert.strictEqual(vscode.window.activeTextEditor, undefined);
  });

  test('should show and hide hotspot in found file', async () => {

    const hotspot = buildHotspot('main.js');
    await showSecurityHotspot(hotspot);

    assert.notStrictEqual(vscode.window.activeTextEditor, undefined, 'should open main.js in text editor');
    const hotspotDiags = getHotspotsInCurrentEditor();
    assert.strictEqual(hotspotDiags.length, 1, 'should have one hotspot diagnostic');
    const hotspotDiag = hotspotDiags[0];

    assert.strictEqual(hotspotDiag.code, hotspot.rule.key, 'code should match rule key');
    assert.strictEqual(hotspotDiag.message, hotspot.message, 'messages should match');
    assert.strictEqual(hotspotDiag.range.start.line, hotspot.textRange.startLine - 1, 'start line should match');
    assert.strictEqual(hotspotDiag.range.start.character, hotspot.textRange.startLineOffset, 'start character should match');
    assert.strictEqual(hotspotDiag.range.end.line, hotspot.textRange.endLine - 1, 'end line should match');
    assert.strictEqual(hotspotDiag.range.end.character, hotspot.textRange.endLineOffset, 'end character should match');
    assert.strictEqual(hotspotDiag.severity, vscode.DiagnosticSeverity.Warning, 'severity should be mapped');

    await vscode.commands.executeCommand(Commands.HIDE_HOTSPOT, vscode.window.activeTextEditor.document, hotspotDiag);
    assert.strictEqual(getHotspotsInCurrentEditor().length, 0, 'should not have hotspot diagnostics anymore');
  });

  test('should show and hide hotspot when several files are found', async () => {

    const hotspot = buildHotspot('sample.js');
    await showSecurityHotspot(hotspot);

    assert.notStrictEqual(vscode.window.activeTextEditor, undefined, 'should open first sample.js in text editor');
    const hotspotDiags = getHotspotsInCurrentEditor();
    assert.strictEqual(hotspotDiags.length, 1, 'should have one hotspot diagnostic');
    const hotspotDiag = hotspotDiags[0];

    await vscode.commands.executeCommand(Commands.HIDE_HOTSPOT, vscode.window.activeTextEditor.document, hotspotDiag);
    assert.strictEqual(getHotspotsInCurrentEditor().length, 0, 'should not have hotspot diagnostics anymore');
  });

  suite('diagnosticSeverity', () => {
    test('High probability maps to Error severity', () => {
      assert.strictEqual(diagnosticSeverity(buildHotspot('file', HotspotProbability.High)), vscode.DiagnosticSeverity.Error);
    });

    test('Medium probability maps to Warning severity', () => {
      assert.strictEqual(diagnosticSeverity(buildHotspot('file', HotspotProbability.Medium)), vscode.DiagnosticSeverity.Warning);
    });

    test('Low probability maps to Info severity', () => {
      assert.strictEqual(diagnosticSeverity(buildHotspot('file', HotspotProbability.Low)), vscode.DiagnosticSeverity.Information);
    });
  });
});
