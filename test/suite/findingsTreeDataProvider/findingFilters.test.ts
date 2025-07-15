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
import { FindingsTreeDataProvider, FindingNode } from '../../../src/findings/findingsTreeDataProvider';
import { FindingType, FindingSource, FilterType } from '../../../src/findings/findingsTreeDataProviderUtil';
import { ImpactSeverity } from '../../../src/lsp/protocol';
import { SonarLintExtendedLanguageClient } from '../../../src/lsp/client';

const TEST_FILE_URI = 'file:///test/file.js';
const TEST_FILE_URI_2 = 'file:///test/file2.js';
const TEST_CURRENT_FILE_URI = 'file:///test/current.js';
const TEST_OPEN_FILE_URI = 'file:///test/open.js';
const TEST_CLOSED_FILE_URI = 'file:///test/closed.js';
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

  setup(() => {
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
    sinon.stub(vscode, 'workspace').value({
      textDocuments: [
        { uri: { toString: () => TEST_OPEN_FILE_URI } } as vscode.TextDocument
      ]
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

  teardown(() => {
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
        impactSeverity: ImpactSeverity.HIGH 
      });
      const blockerFinding = createMockFindingNode({ 
        findingType: FindingType.Issue, 
        key: 'test2',
        impactSeverity: ImpactSeverity.BLOCKER 
      });
      const mediumSeverityFinding = createMockFindingNode({ 
        findingType: FindingType.Issue, 
        key: 'test3',
        impactSeverity: ImpactSeverity.MEDIUM 
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
    test('should return only files with filtered findings', () => {
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
      const rootFiles = underTest.getRootFiles();
      
      expect(rootFiles).to.have.length(1); // Only file1 has findings with fixes
      expect(rootFiles[0].fileUri).to.equal(TEST_FILE_URI);
      expect(rootFiles[0].findingsCount).to.equal(1); // Only 1 finding matches filter
    });

    test('should return empty array when no findings match filter', () => {
      const findings = [
        createMockFindingNode({ findingType: FindingType.Issue, key: 'issue1', isAiCodeFixable: false })
      ];
      (underTest as any).findingsCache.set(TEST_FILE_URI, findings);

      underTest.setFilter(FilterType.Fix_Available);
      const rootFiles = underTest.getRootFiles();
      
      expect(rootFiles).to.have.length(0);
    });
  });

  suite('getNewIssuesFiles with filtering', () => {
    test('should return only new issues files with filtered findings', () => {
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
      const newIssuesFiles = (underTest as any).getNewIssuesFiles();
      
      expect(newIssuesFiles).to.have.length(1);
      expect(newIssuesFiles[0].fileUri).to.equal(TEST_FILE_URI);
      expect(newIssuesFiles[0].findingsCount).to.equal(1); // Only 1 new finding has fix
    });
  });

  suite('getOlderIssuesFiles with filtering', () => {
    test('should return only older issues files with filtered findings', () => {
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
      const olderIssuesFiles = (underTest as any).getOlderIssuesFiles();
      
      expect(olderIssuesFiles).to.have.length(1);
      expect(olderIssuesFiles[0].fileUri).to.equal(TEST_FILE_URI);
      expect(olderIssuesFiles[0].findingsCount).to.equal(1); // Only 1 older finding has fix
    });
  });

  suite('getFindingsForFile with filtering', () => {
    test('should return filtered findings for a file', () => {
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
      (underTest as any).findingsCache.set(TEST_FILE_URI, findings);

      underTest.setFilter(FilterType.Fix_Available);
      const filteredFindings = (underTest as any).getFindingsForFile(TEST_FILE_URI);
      
      expect(filteredFindings).to.have.length(2); // Only 2 findings have fixes
    });

    test('should return filtered findings with category filter', () => {
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
      const newFilteredFindings = (underTest as any).getFindingsForFile(TEST_FILE_URI, 'new');
      const olderFilteredFindings = (underTest as any).getFindingsForFile(TEST_FILE_URI, 'older');
      
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
  impactSeverity?: ImpactSeverity;
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
      impactSeverity: options.impactSeverity ?? ImpactSeverity.MEDIUM
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
