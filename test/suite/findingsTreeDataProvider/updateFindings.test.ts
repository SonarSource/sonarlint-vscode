/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource Sàrl
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
import { ExtendedClient, ExtendedServer } from '../../../src/lsp/protocol';
import { SonarLintExtendedLanguageClient } from '../../../src/lsp/client';
import { NotebookFindingNode } from '../../../src/findings/findingTypes/notebookFindingNode';
import { NotebookNode } from '../../../src/findings/notebookNode';
import { FindingNode } from '../../../src/findings/findingTypes/findingNode';

const TEST_FILE_URI = 'file:///test/file.js';
const TEST_NOTEBOOK_CELL_URI = 'vscode-notebook-cell://test/notebook.ipynb#1234';
const TEST_NOTEBOOK_FILE_URI = 'file:///test/notebook.ipynb';
const TEST_WORKSPACE_FOLDER_URI = 'file:///test';
const TEST_ISSUE_KEY = 'test-issue-key';
const TEST_KEY = 'test-key';
const TEST_RULE = 'test-rule';
const TEST_MESSAGE = 'Test finding';

const mockClient = {
  findingsFiltered: sinon.stub()
} as SonarLintExtendedLanguageClient;

suite('Findings Tree Data Provider Update Methods Test Suite', () => {
  let mockContext: vscode.ExtensionContext;
  let underTest: FindingsTreeDataProvider;
  let refreshSpy: sinon.SinonSpy;

  setup(() => {
    // Stub command registration to prevent conflicts
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

    FindingsTreeDataProvider.init(mockContext, mockClient);
    underTest = FindingsTreeDataProvider.instance;
    
    refreshSpy = sinon.spy(underTest, 'refresh');
  });

  teardown(() => {
    sinon.restore();
  });

  suite('updateHotspots', () => {
    test('should update hotspots for a file', () => {
      const hotspotsPerFile: ExtendedClient.PublishDiagnosticsParams = {
        uri: TEST_FILE_URI,
        diagnostics: [
          createMockDiagnostic({
            source: FindingSource.Local_Hotspot,
            key: TEST_KEY,
            message: TEST_MESSAGE
          })
        ]
      };

      underTest.updateHotspots(hotspotsPerFile);

      // Verify that refresh was called
      expect(refreshSpy.calledOnce).to.be.true;
      
      // Verify that findings were added to cache
      const findings = (underTest as any).getFindingsForFile(TEST_FILE_URI);
      expect(findings).to.have.length(1);
      expect(findings[0].findingType).to.equal(FindingType.SecurityHotspot);
      expect(findings[0].key).to.equal(TEST_KEY);
    });

    test('should replace existing hotspots when updating', () => {
      // First, add some existing findings
      const existingFindings = [
        createMockFindingNode({
          findingType: FindingType.Issue,
          contextValue: 'issueItem',
          source: FindingSource.SonarQube,
          key: 'existing-issue'
        }),
        createMockFindingNode({
          findingType: FindingType.SecurityHotspot,
          contextValue: 'newHotspotItem',
          source: FindingSource.Local_Hotspot,
          key: 'existing-hotspot'
        })
      ];
      (underTest as any).findingsCache.set(TEST_FILE_URI, existingFindings);

      // Update with new hotspots
      const hotspotsPerFile: ExtendedClient.PublishDiagnosticsParams = {
        uri: TEST_FILE_URI,
        diagnostics: [
          createMockDiagnostic({
            source: FindingSource.Remote_Hotspot,
            key: 'new-hotspot',
            message: 'New hotspot'
          })
        ]
      };

      underTest.updateHotspots(hotspotsPerFile);

      // Verify that refresh was called
      expect(refreshSpy.calledOnce).to.be.true;
      
      // Verify that existing issues were preserved but hotspots were replaced
      const findings = (underTest as any).getFindingsForFile(TEST_FILE_URI);
      expect(findings).to.have.length(2);
      
      const issues = findings.filter(f => f.findingType === FindingType.Issue);
      const hotspots = findings.filter(f => f.findingType === FindingType.SecurityHotspot);
      
      expect(issues).to.have.length(1);
      expect(issues[0].key).to.equal('existing-issue');
      
      expect(hotspots).to.have.length(1);
      expect(hotspots[0].key).to.equal('new-hotspot');
    });

    test('should remove file from cache when no findings remain', () => {
      // Add only hotspots to the cache
      const existingHotspots = [
        createMockFindingNode({
          findingType: FindingType.SecurityHotspot,
          contextValue: 'newHotspotItem',
          source: FindingSource.Local_Hotspot,
          key: 'existing-hotspot'
        })
      ];
      (underTest as any).findingsCache.set(TEST_FILE_URI, existingHotspots);

      // Update with empty diagnostics
      const hotspotsPerFile: ExtendedClient.PublishDiagnosticsParams = {
        uri: TEST_FILE_URI,
        diagnostics: []
      };

      underTest.updateHotspots(hotspotsPerFile);

      // Verify that refresh was called
      expect(refreshSpy.calledOnce).to.be.true;
      
      // Verify that file was removed from cache
      const findings = (underTest as any).getFindingsForFile(TEST_FILE_URI);
      expect(findings).to.be.empty;
    });
  });

  suite('updateTaintVulnerabilities', () => {
    test('should update taint vulnerabilities for a file', () => {
      const diagnostics: Diagnostic[] = [
        createMockDiagnostic({
          source: FindingSource.Latest_SonarQube,
          key: TEST_KEY,
          message: TEST_MESSAGE,
          serverIssueKey: TEST_ISSUE_KEY
        })
      ];

      underTest.updateTaintVulnerabilities(TEST_FILE_URI, diagnostics);

      // Verify that refresh was called
      expect(refreshSpy.calledOnce).to.be.true;
      
      // Verify that findings were added to cache
      const findings = (underTest as any).getFindingsForFile(TEST_FILE_URI);
      expect(findings).to.have.length(1);
      expect(findings[0].findingType).to.equal(FindingType.TaintVulnerability);
      expect(findings[0].key).to.equal(TEST_KEY);
      expect(findings[0].serverIssueKey).to.equal(TEST_ISSUE_KEY);
    });

    test('should replace existing taint vulnerabilities when updating', () => {
      // First, add some existing findings
      const existingFindings = [
        createMockFindingNode({
          findingType: FindingType.Issue,
          contextValue: 'issueItem',
          source: FindingSource.SonarQube,
          key: 'existing-issue'
        }),
        createMockFindingNode({
          findingType: FindingType.TaintVulnerability,
          contextValue: 'taintVulnerabilityItem',
          source: FindingSource.Latest_SonarQube,
          key: 'existing-taint',
          serverIssueKey: 'existing-issue-key'
        })
      ];
      (underTest as any).findingsCache.set(TEST_FILE_URI, existingFindings);

      // Update with new taint vulnerabilities
      const diagnostics: Diagnostic[] = [
        createMockDiagnostic({
          source: FindingSource.Latest_SonarCloud,
          key: 'new-taint',
          message: 'New taint vulnerability',
          serverIssueKey: 'new-issue-key'
        })
      ];

      underTest.updateTaintVulnerabilities(TEST_FILE_URI, diagnostics);

      // Verify that refresh was called
      expect(refreshSpy.calledOnce).to.be.true;
      
      // Verify that existing issues were preserved but taint vulnerabilities were replaced
      const findings = (underTest as any).getFindingsForFile(TEST_FILE_URI);
      expect(findings).to.have.length(2);
      
      const issues = findings.filter(f => f.findingType === FindingType.Issue);
      const taints = findings.filter(f => f.findingType === FindingType.TaintVulnerability);
      
      expect(issues).to.have.length(1);
      expect(issues[0].key).to.equal('existing-issue');
      
      expect(taints).to.have.length(1);
      expect(taints[0].key).to.equal('new-taint');
      expect(taints[0].serverIssueKey).to.equal('new-issue-key');
    });
  });

  suite('updateIssues', () => {
    test('should update issues for a file', async () => {
      const diagnostics: vscode.Diagnostic[] = [
        createMockVscodeDiagnostic({
          source: FindingSource.SonarQube,
          key: TEST_KEY,
          message: TEST_MESSAGE
        })
      ];

      underTest.updateIssues(TEST_FILE_URI, diagnostics);

      // Verify that refresh was called
      expect(refreshSpy.calledOnce).to.be.true;
      
      // Verify that findings were added to cache
      const findings = await (underTest as any).getFindingsForFile(TEST_FILE_URI);
      expect(findings).to.have.length(1);
      expect(findings[0].findingType).to.equal(FindingType.Issue);
      expect(findings[0].key).to.equal(TEST_KEY);
    });

    test('should handle files outside workspace folders without crashing', () => {
      const outsideWorkspaceUri = 'file:///outside/workspace/file.js';
      const diagnostics: vscode.Diagnostic[] = [
        createMockVscodeDiagnostic({
          source: FindingSource.SonarQube,
          key: TEST_KEY,
          message: TEST_MESSAGE
        })
      ];

      // Mock workspace folder lookup to return undefined (file outside workspace)
      const getWorkspaceFolderStub = sinon.stub(vscode.workspace, 'getWorkspaceFolder');
      getWorkspaceFolderStub.returns(undefined);

      // This should not throw an error
      expect(() => {
        underTest.updateIssues(outsideWorkspaceUri, diagnostics);
      }).to.not.throw();

      // Verify that refresh was called
      expect(refreshSpy.calledOnce).to.be.true;
      
      // Verify that findings were still added to cache
      const findings = (underTest as any).getFindingsForFile(outsideWorkspaceUri);
      expect(findings).to.have.length(1);
      expect(findings[0].findingType).to.equal(FindingType.Issue);
      expect(findings[0].key).to.equal(TEST_KEY);

      getWorkspaceFolderStub.restore();
    });

    test('should replace existing issues when updating', () => {
      // First, add some existing findings
      const existingFindings = [
        createMockFindingNode({
          findingType: FindingType.SecurityHotspot,
          contextValue: 'newHotspotItem',
          source: FindingSource.Local_Hotspot,
          key: 'existing-hotspot'
        }),
        createMockFindingNode({
          findingType: FindingType.Issue,
          contextValue: 'issueItem',
          source: FindingSource.SonarQube,
          key: 'existing-issue'
        })
      ];
      (underTest as any).findingsCache.set(TEST_FILE_URI, existingFindings);

      // Update with new issues
      const diagnostics: vscode.Diagnostic[] = [
        createMockVscodeDiagnostic({
          source: FindingSource.SonarQube,
          key: 'new-issue',
          message: 'New issue'
        })
      ];

      underTest.updateIssues(TEST_FILE_URI, diagnostics);

      // Verify that refresh was called
      expect(refreshSpy.calledOnce).to.be.true;
      
      // Verify that existing hotspots were preserved but issues were replaced
      const findings = (underTest as any).getFindingsForFile(TEST_FILE_URI);
      expect(findings).to.have.length(2);
      
      const hotspots = findings.filter(f => f.findingType === FindingType.SecurityHotspot);
      const issues = findings.filter(f => f.findingType === FindingType.Issue);
      
      expect(hotspots).to.have.length(1);
      expect(hotspots[0].key).to.equal('existing-hotspot');
      
      expect(issues).to.have.length(1);
      expect(issues[0].key).to.equal('new-issue');
    });

    test('should handle notebook issues correctly', async () => {
      const diagnostics: vscode.Diagnostic[] = [
        createMockVscodeDiagnostic({
          source: FindingSource.SonarQube,
          key: TEST_KEY,
          message: TEST_MESSAGE,
          isNotebookFinding: true
        })
      ];
      const mockWorkspaceFolder = { uri: vscode.Uri.parse(TEST_WORKSPACE_FOLDER_URI) };
      sinon.stub(vscode.workspace, 'getWorkspaceFolder').returns(mockWorkspaceFolder);
      const fileNode = new NotebookNode(TEST_NOTEBOOK_FILE_URI, 1, undefined, [TEST_NOTEBOOK_CELL_URI]);

      underTest.updateIssues(TEST_NOTEBOOK_CELL_URI, diagnostics);

      // Verify that refresh was called
      expect(refreshSpy.calledOnce).to.be.true;
      
      // Verify that findings were added to cache
      const findings = (await underTest.getChildren(fileNode)) as FindingNode[];
      expect(findings).to.have.length(1);
      expect(findings[0].findingType).to.equal(FindingType.Issue);
      expect(findings[0].key).to.equal(TEST_KEY);
      expect(findings[0] instanceof NotebookFindingNode).to.be.true;
    });
  });
});

function createMockDiagnostic(options: {
  source: FindingSource;
  key: string;
  message: string;
  serverIssueKey?: string;
  isAiCodeFixable?: boolean;
  hasQuickFix?: boolean;
  isOnNewCode?: boolean;
  impactSeverity?: ExtendedServer.ImpactSeverity;
}): Diagnostic {
  const diagnostic = {
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
    message: options.message,
    severity: 1,
    code: TEST_RULE,
    source: options.source,
    data: {
      entryKey: options.key,
      serverIssueKey: options.serverIssueKey,
      isAiCodeFixable: options.isAiCodeFixable ?? false,
      hasQuickFix: options.hasQuickFix ?? false,
      isOnNewCode: options.isOnNewCode ?? false,
      impactSeverity: options.impactSeverity ?? ExtendedServer.ImpactSeverity.MEDIUM
    }
  };
  return diagnostic as Diagnostic;
}

function createMockVscodeDiagnostic(options: {
  source: FindingSource;
  key: string;
  message: string;
  isNotebookFinding?: boolean;
}): vscode.Diagnostic {
  const diag = {
    range: new vscode.Range(0, 0, 0, 10),
    message: options.message,
    severity: vscode.DiagnosticSeverity.Warning,
    code: TEST_RULE,
    source: options.source,
  };
  diag['data'] = {
    entryKey: options.key,
    isAiCodeFixable: false,
    hasQuickFix: false,
    isOnNewCode: false,
    impactSeverity: ExtendedServer.ImpactSeverity.MEDIUM,
  }
  return diag as vscode.Diagnostic;
}

function createMockFindingNode(options: {
  findingType: FindingType;
  contextValue: string;
  source: FindingSource;
  serverIssueKey?: string;
  key?: string;
  fileUri?: string;
  isNotebookFinding?: boolean;
}): FindingNode {
  const mockDiagnostic = {
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
    message: TEST_MESSAGE,
    severity: 1,
    code: TEST_RULE,
    source: options.source,
    data: {
      entryKey: options.key || TEST_KEY,
      serverIssueKey: options.serverIssueKey,
      isAiCodeFixable: false,
      hasQuickFix: false,
      isOnNewCode: false,
      impactSeverity: ExtendedServer.ImpactSeverity.MEDIUM
    }
  } as Diagnostic;

  const findingNode = options.isNotebookFinding ? new NotebookFindingNode(
    options.fileUri || TEST_FILE_URI,
    mockDiagnostic
  ) : new FindingNode(
    options.fileUri || TEST_FILE_URI,
    options.findingType,
    mockDiagnostic
  );

  // Override the contextValue to test different scenarios
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (findingNode as any).contextValue = options.contextValue;
  
  return findingNode;
}
