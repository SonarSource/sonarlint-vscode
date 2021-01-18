/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2021 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as assert from 'assert';
import * as vscode from 'vscode';
import { HOTSPOT_SOURCE, showSecurityHotspot } from '../../src/hotspots';
import { RemoteHotspot } from '../../src/protocol';

suite('Hotspots Test Suite', async () => {

  test('should show error when no file is found', async () => {

    const hotspot: RemoteHotspot = {
      message: 'Hotspot here!',
      filePath: 'not/in/workspace',
      textRange: {
        startLine: 1
      },
      author: 'some.one@company.corp',
      status: 'OPEN',
      rule: {
        key: 'java:S4242',
        name: 'Life, The Universe and Everything',
        securityCategory: 'dos',
        vulnerabilityProbability: 'HIGH',
        riskDescription: 'Answering to this question might require building a huge planet-sized computer',
        vulnerabilityDescription: 'If it is built on the path of a galactic highway, you might never get the answer',
        fixRecommendations: 'Build it somewhere else'
      }
    };

    await showSecurityHotspot(hotspot);

    // TODO Find a way to assert error messages?
    assert.strictEqual(vscode.window.activeTextEditor, undefined);
  });

  test('should show error when several files are found', async () => {

    const hotspot: RemoteHotspot = {
      message: 'Hotspot here!',
      filePath: 'sample.js',
      textRange: {
        startLine: 1
      },
      author: 'some.one@company.corp',
      status: 'OPEN',
      rule: {
        key: 'java:S4242',
        name: 'Life, The Universe and Everything',
        securityCategory: 'dos',
        vulnerabilityProbability: 'HIGH',
        riskDescription: 'Answering to this question might require building a huge planet-sized computer',
        vulnerabilityDescription: 'If it is built on the path of a galactic highway, you might never get the answer',
        fixRecommendations: 'Build it somewhere else'
      }
    };

    await showSecurityHotspot(hotspot);

    // TODO Find a way to assert error messages?
    assert.strictEqual(vscode.window.activeTextEditor, undefined);
  });

  test('should show error when several files are found', async () => {

    const hotspot: RemoteHotspot = {
      message: 'Hotspot here!',
      filePath: 'main.js',
      textRange: {
        startLine: 1,
        startLineOffset: 9,
        endLine: 1,
        endLineOffset: 12
      },
      author: 'some.one@company.corp',
      status: 'OPEN',
      rule: {
        key: 'java:S4242',
        name: 'Life, The Universe and Everything',
        securityCategory: 'dos',
        vulnerabilityProbability: 'HIGH',
        riskDescription: 'Answering to this question might require building a huge planet-sized computer',
        vulnerabilityDescription: 'If it is built on the path of a galactic highway, you might never get the answer',
        fixRecommendations: 'Build it somewhere else'
      }
    };

    await showSecurityHotspot(hotspot);

    assert.notStrictEqual(vscode.window.activeTextEditor, undefined);
    const diagnostics = vscode.languages.getDiagnostics(vscode.window.activeTextEditor.document.uri);
    const hotspotDiags = diagnostics.filter(d => d.source === HOTSPOT_SOURCE);
    assert.strictEqual(hotspotDiags.length, 1);
    const hotspotDiag = hotspotDiags[0];

    assert.strictEqual(hotspotDiag.code, hotspot.rule.key);
    assert.strictEqual(hotspotDiag.message, hotspot.message);
    assert.strictEqual(hotspotDiag.range.start.line, hotspot.textRange.startLine - 1);
    assert.strictEqual(hotspotDiag.range.start.character, hotspot.textRange.startLineOffset);
    assert.strictEqual(hotspotDiag.range.end.line, hotspot.textRange.endLine - 1);
    assert.strictEqual(hotspotDiag.range.end.character, hotspot.textRange.endLineOffset);
    assert.strictEqual(hotspotDiag.severity, vscode.DiagnosticSeverity.Warning);
  });
});
