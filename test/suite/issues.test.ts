/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
import { Flow, Issue, TextRange } from '../../src/lsp/protocol';
import { adaptFlows, createDiagnosticFromIssue, isFileLevelIssue } from '../../src/util/issue';
import { expect } from 'chai';

suite('issues', () => {
  suite('createDiagnosticFromIssue', () => {
    test('should create diagnostic from regular issue', () => {
      const issue: Issue = {
        fileUri: 'fileUri',
        message: 'Fix this',
        ruleKey: 'myRuleKey',
        shouldOpenRuleDescription: true,
        flows: [],
        textRange: {
          startLine: 1,
          startLineOffset: 0,
          endLine: 1,
          endLineOffset: 5
        },
        codeMatches: true
      };
      const diagnostic = createDiagnosticFromIssue(issue);

      expect(diagnostic.range.start.line).to.equal(issue.textRange.startLine - 1);
      expect(diagnostic.range.start.character).to.equal(issue.textRange.startLineOffset);
      expect(diagnostic.range.end.line).to.equal(issue.textRange.endLine - 1);
      expect(diagnostic.range.end.character).to.equal(issue.textRange.endLineOffset);
      expect(diagnostic.message).to.equal(issue.message);
      expect(diagnostic.code).to.equal(issue.ruleKey);
      expect(diagnostic.source).to.equal('sonarqube(myRuleKey)');
    });

    test('should create diagnostic from file-level issue', () => {
      const issue: Issue = {
        fileUri: 'fileUri',
        message: 'Fix this',
        ruleKey: 'myRuleKey',
        shouldOpenRuleDescription: true,
        flows: [],
        textRange: {
          startLine: 0,
          startLineOffset: 0,
          endLine: 0,
          endLineOffset: 0
        },
        codeMatches: true
      };
      const diagnostic = createDiagnosticFromIssue(issue);

      expect(diagnostic.range.start.line).to.equal(0);
      expect(diagnostic.range.start.character).to.equal(0);
      expect(diagnostic.range.end.line).to.equal(0);
      expect(diagnostic.range.end.character).to.equal(0);
      expect(diagnostic.message).to.equal(issue.message);
      expect(diagnostic.code).to.equal(issue.ruleKey);
      expect(diagnostic.source).to.equal('sonarqube(myRuleKey)');
    });
  });
  test('should adaptFlows', async () => {
    const flow: Flow = {
      locations: [
        {
          uri: 'file:///my/file',
          filePath: 'my/file',
          textRange: {
            startLine: 1,
            startLineOffset: 2,
            endLine: 3,
            endLineOffset: 4
          },
          message: 'Message 1',
          exists: true,
          codeMatches: true
        },
        {
          uri: 'file:///my/other/file',
          filePath: 'my/other/file',
          textRange: {
            startLine: 2,
            startLineOffset: 3,
            endLine: 4,
            endLineOffset: 5
          },
          message: 'Message 2',
          exists: true,
          codeMatches: true
        }
      ]
    };
    const issue: Issue = {
      fileUri: 'fileUri',
      message: 'Fix this',
      ruleKey: 'myRuleKey',
      shouldOpenRuleDescription: true,
      flows: [flow],
      textRange: {
        startLine: 1,
        startLineOffset: 0,
        endLine: 1,
        endLineOffset: 5
      },
      codeMatches: true
    };

    const result = await adaptFlows(issue);

    expect(result[0].locations[0].filePath).to.equal('file:///my/file');
    expect(result[0].locations[1].filePath).to.equal('file:///my/other/file');
  });

  test('isFileLevelIssue', () => {
    const textRange1: TextRange = {
      startLine: 0,
      startLineOffset: 0,
      endLine: 0,
      endLineOffset: 0
    };

    const textRange2: TextRange = {
      startLine: 0,
      startLineOffset: 0,
      endLine: 1,
      endLineOffset: 2
    };

    const textRange3: TextRange = {
      startLine: 2,
      startLineOffset: 0,
      endLine: 0,
      endLineOffset: 0
    };

    const textRange4: TextRange = {
      startLine: 1,
      startLineOffset: 2,
      endLine: 3,
      endLineOffset: 4
    };

    expect(isFileLevelIssue(textRange1)).to.be.true;
    expect(isFileLevelIssue(textRange2)).to.be.true;
    expect(isFileLevelIssue(textRange3)).to.be.true;
    expect(isFileLevelIssue(textRange4)).to.be.false;
  });
});
