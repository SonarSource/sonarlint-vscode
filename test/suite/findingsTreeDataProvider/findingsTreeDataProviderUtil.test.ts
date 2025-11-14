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
import {
  FindingSource,
  getFilterContextValue,
  getFilterDisplayName,
  FilterType,
  selectAndApplyCodeAction,
} from '../../../src/findings/findingsTreeDataProviderUtil';
import { getContextValueForFinding } from '../../../src/findings/findingTypes/findingNode';

suite('Findings Tree Data Provider Util Test Suite', () => {

  suite('getContextValueForFinding', () => {
    test('should handle boolean parameter combinations correctly', () => {
      const testCases = [
        { source: FindingSource.SonarQube, isAiCodeFixable: false, expected: 'issueItem' },
        { source: FindingSource.SonarQube, isAiCodeFixable: true, expected: 'AICodeFixableIssueItem' },
        { source: FindingSource.Latest_SonarQube, isAiCodeFixable: false, expected: 'taintVulnerabilityItem' },
        { source: FindingSource.Latest_SonarQube, isAiCodeFixable: true, expected: 'AICodeFixableTaintItem' },
        { source: FindingSource.Latest_SonarCloud, isAiCodeFixable: false, expected: 'taintVulnerabilityItem' },
        { source: FindingSource.Latest_SonarCloud, isAiCodeFixable: true, expected: 'AICodeFixableTaintItem' }
      ];

      testCases.forEach(({ source, isAiCodeFixable, expected }) => {
        const result = getContextValueForFinding(source, isAiCodeFixable);
        expect(result).to.equal(expected, 
          `Failed for source: ${source}, isAiCodeFixable: ${isAiCodeFixable}`);
          });
  });

  suite('selectAndApplyCodeAction', () => {
    let showQuickPickStub: sinon.SinonStub;
    let applyEditStub: sinon.SinonStub;
    let executeCommandStub: sinon.SinonStub;
    let showErrorMessageStub: sinon.SinonStub;
    let showWarningMessageStub: sinon.SinonStub;

    setup(() => {
      showQuickPickStub = sinon.stub(vscode.window, 'showQuickPick');
      applyEditStub = sinon.stub(vscode.workspace, 'applyEdit');
      executeCommandStub = sinon.stub(vscode.commands, 'executeCommand');
      showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage');
      showWarningMessageStub = sinon.stub(vscode.window, 'showWarningMessage');
    });

    teardown(() => {
      sinon.restore();
    });

    test('should show quick pick with code actions', async () => {
      const codeActions = [
        { title: 'Fix 1', edit: undefined, command: undefined },
        { title: 'Fix 2', edit: undefined, command: undefined }
      ] as vscode.CodeAction[];

      showQuickPickStub.resolves(undefined); // User cancels

      await selectAndApplyCodeAction(codeActions);

      expect(showQuickPickStub.calledOnce).to.be.true;
      const callArgs = showQuickPickStub.getCall(0).args;
      expect(callArgs[0]).to.have.length(2);
      expect(callArgs[0][0]).to.deep.include({ label: 'Fix 1', index: 0 });
      expect(callArgs[0][1]).to.deep.include({ label: 'Fix 2', index: 1 });
      expect(callArgs[1]).to.deep.include({
        title: 'Select an Action to Apply',
        placeHolder: 'What would you like to do?'
      });
    });

    test('should apply edit when code action has edit', async () => {
      const mockEdit = sinon.createStubInstance(vscode.WorkspaceEdit);
      const codeActions = [
        { 
          title: 'Fix with Edit', 
          edit: mockEdit, 
          command: { command: 'test.command', arguments: ['arg1'] }
        }
      ] as vscode.CodeAction[];

      showQuickPickStub.resolves({ index: 0 });
      applyEditStub.resolves(true);
      executeCommandStub.resolves(undefined);

      await selectAndApplyCodeAction(codeActions);

      expect(applyEditStub.calledOnceWith(mockEdit)).to.be.true;
      expect(executeCommandStub.calledOnceWith('test.command', 'arg1')).to.be.true;
    });

    test('should execute command when code action has command but no edit', async () => {
      const codeActions = [
        { 
          title: 'Fix with Command', 
          edit: undefined, 
          command: { command: 'test.command', arguments: ['arg1', 'arg2'] }
        }
      ] as vscode.CodeAction[];

      showQuickPickStub.resolves({ index: 0 });
      executeCommandStub.resolves(undefined);

      await selectAndApplyCodeAction(codeActions);

      expect(applyEditStub.called).to.be.false;
      expect(executeCommandStub.calledOnceWith('test.command', 'arg1', 'arg2')).to.be.true;
    });

    test('should handle command with no arguments', async () => {
      const codeActions = [
        { 
          title: 'Fix with Command', 
          edit: undefined, 
          command: { command: 'test.command', arguments: undefined }
        }
      ] as vscode.CodeAction[];

      showQuickPickStub.resolves({ index: 0 });
      executeCommandStub.resolves(undefined);

      await selectAndApplyCodeAction(codeActions);

      expect(executeCommandStub.calledOnceWith('test.command')).to.be.true;
    });

    test('should show warning when code action has no edit or command', async () => {
      const codeActions = [
        { 
          title: 'Fix with Nothing', 
          edit: undefined, 
          command: undefined
        }
      ] as vscode.CodeAction[];

      showQuickPickStub.resolves({ index: 0 });

      await selectAndApplyCodeAction(codeActions);

      expect(showWarningMessageStub.calledOnceWith('Selected Code Action has no edit or command to execute.')).to.be.true;
      expect(applyEditStub.called).to.be.false;
      expect(executeCommandStub.called).to.be.false;
    });

    test('should handle error when applying edit fails', async () => {
      const mockEdit = sinon.createStubInstance(vscode.WorkspaceEdit);
      const codeActions = [
        { 
          title: 'Fix with Edit', 
          edit: mockEdit, 
          command: { command: 'test.command', arguments: ['arg1'] }
        }
      ] as vscode.CodeAction[];

      const error = new Error('Edit failed');
      showQuickPickStub.resolves({ index: 0 });
      applyEditStub.rejects(error);

      await selectAndApplyCodeAction(codeActions);

      expect(showErrorMessageStub.calledOnceWith('Error applying quick fix: Edit failed'), 'show message').to.be.true;
      expect(executeCommandStub.called).to.be.false;
    });

    test('should handle error when executing command fails', async () => {
      const mockEdit = sinon.createStubInstance(vscode.WorkspaceEdit);
      const codeActions = [
        { 
          title: 'Fix with Edit', 
          edit: mockEdit, 
          command: { command: 'test.command', arguments: ['arg1'] }
        }
      ] as vscode.CodeAction[];

      const error = new Error('Command failed');
      showQuickPickStub.resolves({ index: 0 });
      applyEditStub.resolves(true);
      executeCommandStub.rejects(error);

      await selectAndApplyCodeAction(codeActions);

      expect(showErrorMessageStub.calledOnceWith('Error applying quick fix: Command failed')).to.be.true;
    });

    test('should do nothing when user cancels selection', async () => {
      const codeActions = [
        { title: 'Fix 1', edit: undefined, command: undefined }
      ] as vscode.CodeAction[];

      showQuickPickStub.resolves(undefined);

      await selectAndApplyCodeAction(codeActions);

      expect(applyEditStub.called).to.be.false;
      expect(executeCommandStub.called).to.be.false;
      expect(showWarningMessageStub.called).to.be.false;
      expect(showErrorMessageStub.called).to.be.false;
    });

    test('should handle empty code actions array', async () => {
      const codeActions: vscode.CodeAction[] = [];

      showQuickPickStub.resolves(undefined);

      await selectAndApplyCodeAction(codeActions);

      expect(showQuickPickStub.calledOnce).to.be.true;
      const callArgs = showQuickPickStub.getCall(0).args;
      expect(callArgs[0]).to.have.length(0);
    });
  });
}); 

  suite('getFilterContextValue', () => {
    test('should return correct context values for all filter types', () => {
      const testCases = [
        { filter: FilterType.All, expected: 'filter-all' },
        { filter: FilterType.Fix_Available, expected: 'filter-fix-available' },
        { filter: FilterType.Open_Files_Only, expected: 'filter-open-files' },
        { filter: FilterType.High_Severity_Only, expected: 'filter-high-severity' },
        { filter: FilterType.Current_File_Only, expected: 'filter-current-file' }
      ];

      testCases.forEach(({ filter, expected }) => {
        const result = getFilterContextValue(filter);
        expect(result).to.equal(expected, 
          `Failed for filter: ${filter}`);
      });
    });

    test('should return default value for unknown filter type', () => {
      // Test with a non-existent enum value to ensure default case works
      const result = getFilterContextValue('unknown' as FilterType);
      expect(result).to.equal('filter-all');
    });
  });

  suite('getFilterDisplayName', () => {
    test('should return correct display names for all filter types', () => {
      const testCases = [
        { filter: FilterType.All, expected: 'All Findings' },
        { filter: FilterType.Fix_Available, expected: 'Findings with Fix Available' },
        { filter: FilterType.Open_Files_Only, expected: 'Findings in Open Files' },
        { filter: FilterType.High_Severity_Only, expected: 'High Severity Findings' },
        { filter: FilterType.Current_File_Only, expected: 'Findings in Current File' }
      ];

      testCases.forEach(({ filter, expected }) => {
        const result = getFilterDisplayName(filter);
        expect(result).to.equal(expected, 
          `Failed for filter: ${filter}`);
      });
    });

    test('should return default value for unknown filter type', () => {
      // Test with a non-existent enum value to ensure default case works
      const result = getFilterDisplayName('unknown' as FilterType);
      expect(result).to.equal('All Findings');
    });
  });
});
