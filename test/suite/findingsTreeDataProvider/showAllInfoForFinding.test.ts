/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { expect } from 'chai';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { Diagnostic } from 'vscode-languageserver-types';
import { FindingsTreeDataProvider } from '../../../src/findings/findingsTreeDataProvider';
import { FindingType, FindingSource } from '../../../src/findings/findingsTreeDataProviderUtil';
import { ExtendedServer } from '../../../src/lsp/protocol';
import { SonarLintExtendedLanguageClient } from '../../../src/lsp/client';
import { NotebookFindingNode } from '../../../src/findings/findingTypes/notebookFindingNode';
import { FindingNode } from '../../../src/findings/findingTypes/findingNode';

const TEST_FILE_URI = 'file:///test/file.js';
const TEST_ISSUE_KEY = 'test-issue-key';
const TEST_KEY = 'test-key';
const TEST_RULE = 'test-rule';
const TEST_MESSAGE = 'Test finding';
const SHOW_ISSUE_DETAILS_CODE_ACTION = 'SonarLint.ShowIssueDetailsCodeAction';

const mockClient = {
  findingsFiltered: sinon.stub()
} as SonarLintExtendedLanguageClient;

suite('Findings Tree Data Provider Test Suite', () => {

  let executeCommandStub: sinon.SinonStub;
  let mockContext: vscode.ExtensionContext;
  let underTest: FindingsTreeDataProvider;

  setup(() => {
    // Stub before any other operations
    executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves(undefined);
    sinon.stub(vscode.commands, 'registerCommand').returns({
      dispose: sinon.stub()
    });
    
    mockContext = {
      subscriptions: [],
      workspaceState: {
        get: sinon.stub(),
        update: sinon.stub()
      }
    } as vscode.ExtensionContext;

    // Initialize the provider
    FindingsTreeDataProvider.init(mockContext, mockClient);
    underTest = FindingsTreeDataProvider.instance;
  });

  teardown(() => {
    sinon.restore();
  });

  suite('showAllInfoForFinding', () => {

    setup(() => {
      // Reset the stub call count for each test
      executeCommandStub.reset();
    });

    test('should execute hotspot commands for security hotspot with newHotspotItem context', () => {
      const finding = createMockFindingNode({
        findingType: FindingType.SecurityHotspot,
        contextValue: 'newHotspotItem',
        source: FindingSource.Local_Hotspot
      });

      underTest.showAllInfoForFinding(finding);

      expect(executeCommandStub.callCount).to.equal(2);
      expect(executeCommandStub.getCall(0).args[0]).to.equal('SonarLint.ShowHotspotLocation');
      expect(executeCommandStub.getCall(0).args[1]).to.equal(finding);
      expect(executeCommandStub.getCall(1).args[0]).to.equal('SonarLint.ShowHotspotRuleDescription');
      expect(executeCommandStub.getCall(1).args[1]).to.equal(finding);
    });

    test('should execute hotspot commands for security hotspot with knownHotspotItem context', () => {
      const finding = createMockFindingNode({
        findingType: FindingType.SecurityHotspot,
        contextValue: 'knownHotspotItem',
        source: FindingSource.Remote_Hotspot
      });

      underTest.showAllInfoForFinding(finding);

      // The stub is called 2 times: 2 hotspot commands
      expect(executeCommandStub.callCount).to.equal(2);
      expect(executeCommandStub.getCall(0).args[0]).to.equal('SonarLint.ShowHotspotLocation');
      expect(executeCommandStub.getCall(0).args[1]).to.equal(finding);
      expect(executeCommandStub.getCall(1).args[0]).to.equal('SonarLint.ShowHotspotDetails');
      expect(executeCommandStub.getCall(1).args[1]).to.equal(finding);
    });

    test('should execute taint vulnerability commands for taint vulnerability', () => {
      const finding = createMockFindingNode({
        findingType: FindingType.TaintVulnerability,
        contextValue: 'taintVulnerabilityItem',
        source: FindingSource.Latest_SonarQube,
        serverIssueKey: TEST_ISSUE_KEY,
        key: TEST_KEY,
        fileUri: TEST_FILE_URI
      });

      underTest.showAllInfoForFinding(finding);

      expect(executeCommandStub.callCount).to.equal(2);
      expect(executeCommandStub.getCall(0).args[0]).to.equal('SonarLint.ShowTaintVulnerabilityFlows');
      expect(executeCommandStub.getCall(0).args[1]).to.equal(TEST_ISSUE_KEY);
      expect(executeCommandStub.getCall(0).args[2]).to.be.empty;
      expect(executeCommandStub.getCall(1).args[0]).to.equal(SHOW_ISSUE_DETAILS_CODE_ACTION);
      expect(executeCommandStub.getCall(1).args[1]).to.equal(TEST_KEY);
      expect(executeCommandStub.getCall(1).args[2]).to.equal(TEST_FILE_URI);
    });

    test('should execute issue commands for regular issue (not notebook)', () => {
      const finding = createMockFindingNode({
        findingType: FindingType.Issue,
        contextValue: 'issueItem',
        source: FindingSource.SonarQube,
        key: TEST_KEY,
        fileUri: TEST_FILE_URI,
        isNotebookFinding: false
      });

      underTest.showAllInfoForFinding(finding);

      expect(executeCommandStub.callCount).to.equal(2);
      expect(executeCommandStub.getCall(0).args[0]).to.equal('SonarLint.ShowIssueFlows');
      expect(executeCommandStub.getCall(0).args[1]).to.equal(TEST_KEY);
      expect(executeCommandStub.getCall(0).args[2]).to.equal(TEST_FILE_URI);
      expect(executeCommandStub.getCall(1).args[0]).to.equal(SHOW_ISSUE_DETAILS_CODE_ACTION);
      expect(executeCommandStub.getCall(1).args[1]).to.equal(TEST_KEY);
      expect(executeCommandStub.getCall(1).args[2]).to.equal(TEST_FILE_URI);
    });

    test('should execute only issue details command for notebook issue', () => {
      const finding = createMockFindingNode({
        findingType: FindingType.Issue,
        contextValue: 'notebookIssueItem',
        source: FindingSource.SonarQube,
        key: TEST_KEY,
        fileUri: TEST_FILE_URI,
        isNotebookFinding: true
      });

      underTest.showAllInfoForFinding(finding);

      // The stub is called 1 time: only issue details command (flows not supported for notebooks)
      expect(executeCommandStub.callCount).to.equal(1);
      expect(executeCommandStub.getCall(0).args[0]).to.equal(SHOW_ISSUE_DETAILS_CODE_ACTION);
      expect(executeCommandStub.getCall(0).args[1]).to.equal(TEST_KEY);
      expect(executeCommandStub.getCall(0).args[2]).to.equal(TEST_FILE_URI);
    });

  });
});

function createMockFindingNode(options: {
  findingType: FindingType;
  contextValue: string;
  source: FindingSource;
  serverIssueKey?: string;
  key?: string;
  fileUri?: string;
  isNotebookFinding?: boolean;
}): FindingNode {
  const mockDiagnostic: Diagnostic = {
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
    message: TEST_MESSAGE,
    severity: 1,
    code: TEST_RULE,
    source: options.source,
    data: {
      entryKey: options.key || 'test-key',
      serverIssueKey: options.serverIssueKey,
      isAiCodeFixable: false,
      hasQuickFix: false,
      isOnNewCode: false,
      impactSeverity: ExtendedServer.ImpactSeverity.MEDIUM
    }
  };

  const findingNode = options.isNotebookFinding ? new NotebookFindingNode(
    options.fileUri || TEST_FILE_URI,
    mockDiagnostic
  ) : new FindingNode(
    options.fileUri || TEST_FILE_URI,
    options.findingType,
    mockDiagnostic
  );

  // Override the contextValue to test different scenarios
  (findingNode as any).contextValue = options.contextValue;
  
  return findingNode;
} 