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
import { FindingType, FindingSource, FilterType } from '../../../src/findings/findingsTreeDataProviderUtil';
import { ExtendedServer } from '../../../src/lsp/protocol';
import { SonarLintExtendedLanguageClient } from '../../../src/lsp/client';
import { FindingNode } from '../../../src/findings/findingTypes/findingNode';
import { FindingsFileNode } from '../../../src/findings/findingsFileNode';
import { SETUP_TEARDOWN_HOOK_TIMEOUT } from '../commons';

const TEST_FILE_URI = 'file:///test/file.js';
const TEST_FILE_URI_2 = 'file:///test/file2.js';
const TEST_CURRENT_FILE_URI = 'file:///test/current.js';
const TEST_OPEN_FILE_URI = 'file:///test/open.js';
const TEST_CLOSED_FILE_URI = 'file:///test/closed.js';
const TEST_NON_EXISTING_FILE_URI = 'file:///non/existing/file.js';
const TEST_KEY = 'test-key';
const TEST_RULE = 'test-rule';
const TEST_MESSAGE = 'Test finding';

const appliedFilter = sinon.stub();

const mockClient = {
  findingsFiltered (filterType: string) {
    console.log('findingsFiltered', filterType);
    appliedFilter(filterType);
  }
} as unknown as SonarLintExtendedLanguageClient;

suite('Findings Tree Data Provider Filtering Test Suite', () => {
  let mockContext: vscode.ExtensionContext;
  let underTest: FindingsTreeDataProvider;
  let refreshSpy: sinon.SinonSpy;
  let executeCommandStub: sinon.SinonStub;

  setup(function () {
    this.timeout(SETUP_TEARDOWN_HOOK_TIMEOUT);
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

    // Stub VS Code API calls
    executeCommandStub = sinon.stub(vscode.commands, 'executeCommand');

    const mockFs = {
      stat: sinon.stub().callsFake(async (uri: vscode.Uri) => {
        if (uri.toString() === TEST_NON_EXISTING_FILE_URI) {
          throw new Error('File does not exist');
        }
        return { type: vscode.FileType.File };
      }),
      readFile: sinon.stub().resolves(new Uint8Array()),
      writeFile: sinon.stub().resolves(),
      delete: sinon.stub().resolves(),
      rename: sinon.stub().resolves(),
      copy: sinon.stub().resolves(),
      readDirectory: sinon.stub().resolves([])
    };

    sinon.stub(vscode, 'workspace').value({
      textDocuments: [
        { uri: { toString: () => TEST_OPEN_FILE_URI } } as vscode.TextDocument
      ],
      getWorkspaceFolder: sinon.stub().returns({
        uri: vscode.Uri.parse('file:///test'),
        name: 'test-workspace',
        index: 0
      }),
      workspaceFolders: [{
        uri: vscode.Uri.parse('file:///test'),
        name: 'test-workspace',
        index: 0
      }],
      fs: mockFs
    });
    sinon.stub(vscode, 'window').value({
      activeTextEditor: {
        document: { uri: { toString: () => TEST_CURRENT_FILE_URI } }
      } as vscode.TextEditor
    });

    FindingsTreeDataProvider.init(mockContext, mockClient);
    underTest = FindingsTreeDataProvider.instance;
    refreshSpy = sinon.spy(underTest, 'refresh');
  });

  teardown(function () {
    this.timeout(SETUP_TEARDOWN_HOOK_TIMEOUT);
    appliedFilter.reset();
    sinon.restore();
  });

  suite('setFilter', () => {
    test('should set active filter and refresh', () => {
      underTest.setFilter(FilterType.Fix_Available);

      expect(underTest.getActiveFilter()).to.equal(FilterType.Fix_Available);
      expect(refreshSpy.calledOnce).to.be.true;
    });

    test('should execute setContext command with correct filter value', () => {
      underTest.setFilter(FilterType.High_Severity_Only);

      expect(executeCommandStub.calledWith('setContext', 'sonarqube.findingsFilter', 'filter-high-severity')).to.be.true;
    });

    test('should call telemetry findingsFiltered method', () => {
      underTest.setFilter(FilterType.Open_Files_Only);

      expect(appliedFilter.calledOnceWith(FilterType.Open_Files_Only)).to.be.true;
    });

    test('should handle all filter types', () => {
      const filterTypes = [
        FilterType.All,
        FilterType.Fix_Available,
        FilterType.Open_Files_Only,
        FilterType.High_Severity_Only,
        FilterType.Current_File_Only
      ];

      filterTypes.forEach(filterType => {
        underTest.setFilter(filterType);
        expect(underTest.getActiveFilter()).to.equal(filterType);
      });
    });
  });

  suite('getActiveFilter', () => {
    test('should return current active filter', () => {
      expect(underTest.getActiveFilter()).to.equal(FilterType.All); // Default filter

      underTest.setFilter(FilterType.Current_File_Only);
      expect(underTest.getActiveFilter()).to.equal(FilterType.Current_File_Only);
    });
  });

  suite('getFilteredFindingsCount', () => {
    test('should return total count when filter is All', () => {
      // Add some findings
      const findings = [
        createMockFindingNode({ findingType: FindingType.Issue, key: 'issue1' }),
        createMockFindingNode({ findingType: FindingType.SecurityHotspot, key: 'hotspot1' }),
        createMockFindingNode({ findingType: FindingType.TaintVulnerability, key: 'taint1' })
      ];
      (underTest as any).findingsCache.set(TEST_FILE_URI, findings);

      expect(underTest.getFilteredFindingsCount()).to.equal(3);
    });

    test('should return filtered count when filter is not All', () => {
      // Add findings with different properties
      const findings = [
        createMockFindingNode({ 
          findingType: FindingType.Issue, 
          key: 'issue1',
          isAiCodeFixable: true 
        }),
        createMockFindingNode({ 
          findingType: FindingType.Issue, 
          key: 'issue2',
          isAiCodeFixable: false 
        }),
        createMockFindingNode({ 
          findingType: FindingType.SecurityHotspot, 
          key: 'hotspot1',
          hasQuickFix: true 
        })
      ];
      (underTest as any).findingsCache.set(TEST_FILE_URI, findings);

      underTest.setFilter(FilterType.Fix_Available);
      expect(underTest.getFilteredFindingsCount()).to.equal(2); // Only 2 have fixes
    });
  });

  suite('matchesFilter', () => {
    test('should match all findings when filter is All', () => {
      const finding = createMockFindingNode({ findingType: FindingType.Issue, key: 'test' });
      
      underTest.setFilter(FilterType.All);
      const matches = (underTest as any).matchesFilter(finding);
      
      expect(matches).to.be.true;
    });

    test('should match findings with AI code fix when filter is Fix_Available', () => {
      const findingWithAiFix = createMockFindingNode({ 
        findingType: FindingType.Issue, 
        key: 'test',
        isAiCodeFixable: true 
      });
      const findingWithoutAiFix = createMockFindingNode({ 
        findingType: FindingType.Issue, 
        key: 'test2',
        isAiCodeFixable: false 
      });
      
      underTest.setFilter(FilterType.Fix_Available);
      
      expect((underTest as any).matchesFilter(findingWithAiFix)).to.be.true;
      expect((underTest as any).matchesFilter(findingWithoutAiFix)).to.be.false;
    });

    test('should match findings with quick fix when filter is Fix_Available', () => {
      const findingWithQuickFix = createMockFindingNode({ 
        findingType: FindingType.Issue, 
        key: 'test',
        hasQuickFix: true 
      });
      const findingWithoutQuickFix = createMockFindingNode({ 
        findingType: FindingType.Issue, 
        key: 'test2',
        hasQuickFix: false 
      });
      
      underTest.setFilter(FilterType.Fix_Available);
      
      expect((underTest as any).matchesFilter(findingWithQuickFix)).to.be.true;
      expect((underTest as any).matchesFilter(findingWithoutQuickFix)).to.be.false;
    });

    test('should match findings in open files when filter is Open_Files_Only', () => {
      const findingInOpenFile = createMockFindingNode({ 
        findingType: FindingType.Issue, 
        key: 'test',
        fileUri: TEST_OPEN_FILE_URI 
      });
      const findingInClosedFile = createMockFindingNode({ 
        findingType: FindingType.Issue, 
        key: 'test2',
        fileUri: TEST_CLOSED_FILE_URI 
      });
      
      underTest.setFilter(FilterType.Open_Files_Only);
      
      expect((underTest as any).matchesFilter(findingInOpenFile)).to.be.true;
      expect((underTest as any).matchesFilter(findingInClosedFile)).to.be.false;
    });

    test('should match high severity findings when filter is High_Severity_Only', () => {
      const highSeverityFinding = createMockFindingNode({ 
        findingType: FindingType.Issue, 
        key: 'test',
        impactSeverity: ExtendedServer.ImpactSeverity.HIGH
      });
      const blockerFinding = createMockFindingNode({ 
        findingType: FindingType.Issue, 
        key: 'test2',
        impactSeverity: ExtendedServer.ImpactSeverity.BLOCKER
      });
      const mediumSeverityFinding = createMockFindingNode({ 
        findingType: FindingType.Issue, 
        key: 'test3',
        impactSeverity: ExtendedServer.ImpactSeverity.MEDIUM
      });
      
      underTest.setFilter(FilterType.High_Severity_Only);
      
      expect((underTest as any).matchesFilter(highSeverityFinding)).to.be.true;
      expect((underTest as any).matchesFilter(blockerFinding)).to.be.true;
      expect((underTest as any).matchesFilter(mediumSeverityFinding)).to.be.false;
    });

    test('should match findings in current file when filter is Current_File_Only', () => {
      const findingInCurrentFile = createMockFindingNode({ 
        findingType: FindingType.Issue, 
        key: 'test',
        fileUri: TEST_CURRENT_FILE_URI 
      });
      const findingInOtherFile = createMockFindingNode({ 
        findingType: FindingType.Issue, 
        key: 'test2',
        fileUri: TEST_FILE_URI 
      });
      
      underTest.setFilter(FilterType.Current_File_Only);
      
      expect((underTest as any).matchesFilter(findingInCurrentFile)).to.be.true;
      expect((underTest as any).matchesFilter(findingInOtherFile)).to.be.false;
    });
  });

  suite('getRootFiles with filtering', () => {
    test('should return only files with filtered findings', async () => {
      // Add findings to multiple files
      const file1Findings = [
        createMockFindingNode({ findingType: FindingType.Issue, key: 'issue1', isAiCodeFixable: true }),
        createMockFindingNode({ findingType: FindingType.Issue, key: 'issue2', isAiCodeFixable: false })
      ];
      const file2Findings = [
        createMockFindingNode({ findingType: FindingType.Issue, key: 'issue3', isAiCodeFixable: false })
      ];
      
      (underTest as any).findingsCache.set(TEST_FILE_URI, file1Findings);
      (underTest as any).findingsCache.set(TEST_FILE_URI_2, file2Findings);

      underTest.setFilter(FilterType.Fix_Available);
      const rootFiles = await underTest.getRootFiles();

      expect(rootFiles).to.have.length(1); // Only file1 has findings with fixes
      expect(rootFiles[0].fileUri).to.equal(TEST_FILE_URI);
      expect(rootFiles[0].findingsCount).to.equal(1); // Only 1 finding matches filter
    });

    test('should not include non-existing files', async () => {
      const nonExistentFileFindings = [
        createMockFindingNode({ findingType: FindingType.Issue, key: 'issue1', isAiCodeFixable: true })
      ];
      const file1Findings = [
        createMockFindingNode({ findingType: FindingType.Issue, key: 'issue2', isAiCodeFixable: true }),
        createMockFindingNode({ findingType: FindingType.Issue, key: 'issue3', isAiCodeFixable: false })
      ];
      const file2Findings = [
        createMockFindingNode({ findingType: FindingType.Issue, key: 'issue4', isAiCodeFixable: false })
      ];
      
      (underTest as any).findingsCache.set(TEST_FILE_URI, file1Findings);
      (underTest as any).findingsCache.set(TEST_FILE_URI_2, file2Findings);
      (underTest as any).findingsCache.set(TEST_NON_EXISTING_FILE_URI, nonExistentFileFindings);

      underTest.setFilter(FilterType.All);
      const rootFiles = await underTest.getRootFiles();
      
      expect(rootFiles).to.have.length(2);
    });

    test('should return empty array when no findings match filter', async () => {
      const findings = [
        createMockFindingNode({ findingType: FindingType.Issue, key: 'issue1', isAiCodeFixable: false })
      ];
      (underTest as any).findingsCache.set(TEST_FILE_URI, findings);

      underTest.setFilter(FilterType.Fix_Available);
      const rootFiles = await underTest.getRootFiles();
      
      expect(rootFiles).to.have.length(0);
    });
  });

  suite('getNewIssuesFiles with filtering', () => {
    test('should return only new issues files with filtered findings', async () => {
      const newFindings = [
        createMockFindingNode({ 
          findingType: FindingType.Issue, 
          key: 'issue1', 
          isOnNewCode: true,
          isAiCodeFixable: true 
        }),
        createMockFindingNode({ 
          findingType: FindingType.Issue, 
          key: 'issue2', 
          isOnNewCode: true,
          isAiCodeFixable: false 
        })
      ];
      const olderFindings = [
        createMockFindingNode({ 
          findingType: FindingType.Issue, 
          key: 'issue3', 
          isOnNewCode: false,
          isAiCodeFixable: true 
        })
      ];
      
      (underTest as any).findingsCache.set(TEST_FILE_URI, [...newFindings, ...olderFindings]);

      underTest.setFilter(FilterType.Fix_Available);
      const newIssuesFiles = await (underTest as any).getNewIssuesFiles();
      
      expect(newIssuesFiles).to.have.length(1);
      expect(newIssuesFiles[0].fileUri).to.equal(TEST_FILE_URI);
      expect(newIssuesFiles[0].findingsCount).to.equal(1); // Only 1 new finding has fix
    });
  });

  suite('getOlderIssuesFiles with filtering', () => {
    test('should return only older issues files with filtered findings', async () => {
      const newFindings = [
        createMockFindingNode({ 
          findingType: FindingType.Issue, 
          key: 'issue1', 
          isOnNewCode: true,
          isAiCodeFixable: true 
        })
      ];
      const olderFindings = [
        createMockFindingNode({ 
          findingType: FindingType.Issue, 
          key: 'issue2', 
          isOnNewCode: false,
          isAiCodeFixable: true 
        }),
        createMockFindingNode({ 
          findingType: FindingType.Issue, 
          key: 'issue3', 
          isOnNewCode: false,
          isAiCodeFixable: false 
        })
      ];
      
      (underTest as any).findingsCache.set(TEST_FILE_URI, [...newFindings, ...olderFindings]);

      underTest.setFilter(FilterType.Fix_Available);
      const olderIssuesFiles = await (underTest as any).getOlderIssuesFiles();
      
      expect(olderIssuesFiles).to.have.length(1);
      expect(olderIssuesFiles[0].fileUri).to.equal(TEST_FILE_URI);
      expect(olderIssuesFiles[0].findingsCount).to.equal(1); // Only 1 older finding has fix
    });
  });

  suite('getChildren with filtering', () => {
    test('should return filtered findings for a file', async () => {
      const findings = [
        createMockFindingNode({ 
          findingType: FindingType.Issue, 
          key: 'issue1',
          isAiCodeFixable: true 
        }),
        createMockFindingNode({ 
          findingType: FindingType.Issue, 
          key: 'issue2',
          isAiCodeFixable: false 
        }),
        createMockFindingNode({ 
          findingType: FindingType.SecurityHotspot, 
          key: 'hotspot1',
          isAiCodeFixable: true 
        })
      ];
      const fileNode = new FindingsFileNode(TEST_FILE_URI, 3, undefined);

      (underTest as any).findingsCache.set(TEST_FILE_URI, findings);

      underTest.setFilter(FilterType.Fix_Available);
      const filteredFindings = await underTest.getChildren(fileNode);
      
      expect(filteredFindings).to.have.length(2); // Only 2 findings have fixes
    });

    test('should return filtered findings with category filter', async () => {
      const newFindings = [
        createMockFindingNode({ 
          findingType: FindingType.Issue, 
          key: 'issue1',
          isOnNewCode: true,
          isAiCodeFixable: true 
        }),
        createMockFindingNode({ 
          findingType: FindingType.Issue, 
          key: 'issue2',
          isOnNewCode: true,
          isAiCodeFixable: false 
        })
      ];
      const olderFindings = [
        createMockFindingNode({ 
          findingType: FindingType.Issue, 
          key: 'issue3',
          isOnNewCode: false,
          isAiCodeFixable: true 
        })
      ];
      const newFindingsFileNode = new FindingsFileNode(TEST_FILE_URI, 3, 'new');
      const olderFindingsFileNode = new FindingsFileNode(TEST_FILE_URI, 3, 'older');
      (underTest as any).findingsCache.set(TEST_FILE_URI, [...newFindings, ...olderFindings]);

      underTest.setFilter(FilterType.Fix_Available);

      const newFilteredFindings = await underTest.getChildren(newFindingsFileNode);
      const olderFilteredFindings = await underTest.getChildren(olderFindingsFileNode);

      expect(newFilteredFindings).to.have.length(1); // Only 1 new finding has fix
      expect(olderFilteredFindings).to.have.length(1); // Only 1 older finding has fix
    });
  });

  suite('getTotalFindingsCount', () => {
    test('should return total count of all findings regardless of filter', () => {
      const findings1 = [
        createMockFindingNode({ findingType: FindingType.Issue, key: 'issue1' }),
        createMockFindingNode({ findingType: FindingType.SecurityHotspot, key: 'hotspot1' })
      ];
      const findings2 = [
        createMockFindingNode({ findingType: FindingType.TaintVulnerability, key: 'taint1' })
      ];
      
      (underTest as any).findingsCache.set(TEST_FILE_URI, findings1);
      (underTest as any).findingsCache.set(TEST_FILE_URI_2, findings2);

      underTest.setFilter(FilterType.Fix_Available); // Set a filter
      const totalCount = underTest.getTotalFindingsCount();
      
      expect(totalCount).to.equal(3); // Should still return total count
    });
  });
});

function createMockFindingNode(options: {
  findingType: FindingType;
  key?: string;
  fileUri?: string;
  isAiCodeFixable?: boolean;
  hasQuickFix?: boolean;
  isOnNewCode?: boolean;
  impactSeverity?: ExtendedServer.ImpactSeverity;
}): FindingNode {
  const mockDiagnostic = {
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
    message: TEST_MESSAGE,
    severity: 1,
    code: TEST_RULE,
    source: FindingSource.SonarQube,
    data: {
      entryKey: options.key || TEST_KEY,
      isAiCodeFixable: options.isAiCodeFixable ?? false,
      hasQuickFix: options.hasQuickFix ?? false,
      isOnNewCode: options.isOnNewCode ?? false,
      impactSeverity: options.impactSeverity ?? ExtendedServer.ImpactSeverity.MEDIUM
    }
  } as Diagnostic;

  const findingNode = new FindingNode(
    options.fileUri || TEST_FILE_URI,
    options.findingType,
    mockDiagnostic
  );

  if (options.isAiCodeFixable !== undefined) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (findingNode as any).isAiCodeFixable = options.isAiCodeFixable;
  }
  if (options.hasQuickFix !== undefined) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (findingNode as any).hasQuickFix = options.hasQuickFix;
  }
  if (options.isOnNewCode !== undefined) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (findingNode as any).isOnNewCode = options.isOnNewCode;
  }
  if (options.impactSeverity !== undefined) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (findingNode as any).impactSeverity = options.impactSeverity;
  }
  
  return findingNode;
}
