/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as sinon from 'sinon';
import { FixSuggestionService } from '../../src/fixSuggestions/fixSuggestionsService';
import { ExtendedClient } from '../../src/lsp/protocol';
import { IdeLabsFlagManagementService } from '../../src/labs/ideLabsFlagManagementService';
import { expect } from 'chai';

// Mock IDE Labs flag to be enabled for these tests - must be before suite definition
sinon.stub(IdeLabsFlagManagementService, 'instance').get(() => ({
  isIdeLabsEnabled: () => true,
  isIdeLabsJoined: () => true
}));

suite('Fix Suggestions Service - Enhanced Test Suite', () => {
  let fixSuggestionService: FixSuggestionService;
  let mockClient: any;
  let folder: string;
  let filePath: string;
  let fileUri: vscode.Uri;

  let showWarningMessageStub: sinon.SinonStub;
  let showInformationMessageStub: sinon.SinonStub;
  let showErrorMessageStub: sinon.SinonStub;
  let showTextDocumentStub: sinon.SinonStub;
  let openTextDocumentStub: sinon.SinonStub;

  setup(async () => {

    // Create temp folder and file
    folder = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'tmpdir'));
    filePath = path.join(folder, 'fixSuggestion.js');
    await fs.promises.writeFile(filePath, 'var i = 0;');
    fileUri = vscode.Uri.file(filePath);

    // Mock language client
    mockClient = {
      fixSuggestionResolved: sinon.stub()
    };

    FixSuggestionService.init(mockClient);
    fixSuggestionService = FixSuggestionService.instance;

    // Stub VS Code window methods
    showWarningMessageStub = sinon.stub(vscode.window, 'showWarningMessage');
    showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage');
    showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage');
    showTextDocumentStub = sinon.stub(vscode.window, 'showTextDocument');
    openTextDocumentStub = sinon.stub(vscode.workspace, 'openTextDocument');
  });

  teardown(async () => {
    sinon.restore();
    // Clean up temp folder
    try {
      await fs.promises.rm(folder, { recursive: true, force: true });
    } catch (err) {
      // Ignore cleanup errors
    }
  });

  suite('File Not Found Scenario', () => {
    test('should show warning with View Fix Details option when file does not exist', async () => {
      const nonExistentUri = vscode.Uri.file(path.join(folder, 'nonexistent.js'));
      const params: ExtendedClient.ShowFixSuggestionParams = {
        suggestionId: 'fix-123',
        fileUri: nonExistentUri.toString(),
        explanation: 'Fix null pointer',
        textEdits: [{
          before: 'var i = 0;',
          after: 'let i = 0;',
          beforeLineRange: { startLine: 1, endLine: 1 }
        }],
        isLocal: true
      };

      showWarningMessageStub.resolves('View Fix Details');
      openTextDocumentStub.resolves({
        getText: () => ''
      });
      showTextDocumentStub.resolves();

      await fixSuggestionService.showFixSuggestion(params);

      expect(showWarningMessageStub.calledOnce).to.be.true;
      expect(showWarningMessageStub.firstCall.args[0]).to.include('Could not find file');
      expect(showWarningMessageStub.firstCall.args[1]).to.equal('View Fix Details');
    });

    test('should open markdown document when View Fix Details is clicked for missing file', async () => {
      const nonExistentUri = vscode.Uri.file(path.join(folder, 'nonexistent.js'));
      const params: ExtendedClient.ShowFixSuggestionParams = {
        suggestionId: 'fix-123',
        fileUri: nonExistentUri.toString(),
        explanation: 'Fix null pointer',
        textEdits: [{
          before: 'var i = 0;',
          after: 'let i = 0;',
          beforeLineRange: { startLine: 1, endLine: 1 }
        }],
        isLocal: true
      };

      showWarningMessageStub.resolves('View Fix Details');

      let markdownContent = '';
      openTextDocumentStub.callsFake((options: any) => {
        if (options && options.language === 'markdown') {
          markdownContent = options.content;
        }
        return Promise.resolve({
          getText: () => markdownContent
        });
      });
      showTextDocumentStub.resolves();

      await fixSuggestionService.showFixSuggestion(params);

      expect(openTextDocumentStub.calledOnce).to.be.true;
      expect(markdownContent).to.include('# SonarQube AI Fix Suggestion');
      expect(markdownContent).to.include('Fix null pointer');
      expect(markdownContent).to.include('### Before');
      expect(markdownContent).to.include('### After');
      expect(showTextDocumentStub.calledOnce).to.be.true;
    });

    test('should not show markdown when View Fix Details is not clicked', async () => {
      const nonExistentUri = vscode.Uri.file(path.join(folder, 'nonexistent.js'));
      const params: ExtendedClient.ShowFixSuggestionParams = {
        suggestionId: 'fix-123',
        fileUri: nonExistentUri.toString(),
        explanation: 'Fix null pointer',
        textEdits: [],
        isLocal: true
      };

      showWarningMessageStub.resolves(undefined); // User dismissed

      await fixSuggestionService.showFixSuggestion(params);

      expect(showWarningMessageStub.calledOnce).to.be.true;
      expect(openTextDocumentStub.called).to.be.false;
    });
  });

  suite('Content Mismatch Scenario', () => {
    test('should show warning with View Fix Details and Try Anyway when content changed', async () => {
      const params: ExtendedClient.ShowFixSuggestionParams = {
        suggestionId: 'fix-123',
        fileUri: fileUri.toString(),
        explanation: 'Fix null pointer',
        textEdits: [{
          before: 'var j = 1;', // Different from actual content
          after: 'let j = 1;',
          beforeLineRange: { startLine: 1, endLine: 1 }
        }],
        isLocal: false // Will trigger content check
      };

      const mockDocument = {
        getText: () => 'var i = 0;', // Actual content different from 'before'
        validateRange: (range: vscode.Range) => range
      };

      openTextDocumentStub.resolves(mockDocument);
      showTextDocumentStub.resolves({
        document: mockDocument
      });
      showWarningMessageStub.resolves('View Fix Details');

      await fixSuggestionService.showFixSuggestion(params);

      expect(showWarningMessageStub.calledOnce).to.be.true;
      expect(showWarningMessageStub.firstCall.args[0]).to.include('content of the file has changed');
      expect(showWarningMessageStub.firstCall.args[1]).to.equal('View Fix Details');
      expect(showWarningMessageStub.firstCall.args[2]).to.equal('Try Anyway');
    });

    test('should show markdown when View Fix Details is selected on content mismatch', async () => {
      const params: ExtendedClient.ShowFixSuggestionParams = {
        suggestionId: 'fix-123',
        fileUri: fileUri.toString(),
        explanation: 'Fix null pointer',
        textEdits: [{
          before: 'var j = 1;',
          after: 'let j = 1;',
          beforeLineRange: { startLine: 1, endLine: 1 }
        }],
        isLocal: false
      };

      const mockDocument = {
        getText: () => 'var i = 0;',
        validateRange: (range: vscode.Range) => range
      };

      openTextDocumentStub.callsFake((options: any) => {
        if (options && options.language === 'markdown') {
          return Promise.resolve({
            getText: () => options.content
          });
        }
        return Promise.resolve(mockDocument);
      });

      showTextDocumentStub.resolves({
        document: mockDocument
      });
      showWarningMessageStub.resolves('View Fix Details');

      await fixSuggestionService.showFixSuggestion(params);

      expect(mockClient.fixSuggestionResolved.calledWith('fix-123', false)).to.be.true;
    });

    test('should proceed with diff when Try Anyway is selected', async () => {
      const params: ExtendedClient.ShowFixSuggestionParams = {
        suggestionId: 'fix-123',
        fileUri: fileUri.toString(),
        explanation: 'Fix null pointer',
        textEdits: [{
          before: 'var j = 1;',
          after: 'let j = 1;',
          beforeLineRange: { startLine: 1, endLine: 1 }
        }],
        isLocal: false
      };

      const mockDocument = {
        getText: () => 'var i = 0;',
        validateRange: (range: vscode.Range) => range
      };

      openTextDocumentStub.resolves(mockDocument);
      showTextDocumentStub.resolves({
        document: mockDocument
      });
      showWarningMessageStub.resolves('Try Anyway');

      const applyEditStub = sinon.stub(vscode.workspace, 'applyEdit').resolves(false);

      await fixSuggestionService.showFixSuggestion(params);

      expect(applyEditStub.calledOnce).to.be.true;
      expect(showInformationMessageStub.calledWith('SonarQube for IDE: AI Fix declined.')).to.be.true;

      applyEditStub.restore();
    });
  });

  suite('Fix Declined Scenario', () => {
    test('should show simple message when fix is declined without View Fix Details button', async () => {
      const params: ExtendedClient.ShowFixSuggestionParams = {
        suggestionId: 'fix-123',
        fileUri: fileUri.toString(),
        explanation: 'Fix null pointer',
        textEdits: [{
          before: 'var i = 0;',
          after: 'let i = 0;',
          beforeLineRange: { startLine: 1, endLine: 1 }
        }],
        isLocal: true
      };

      const mockDocument = {
        getText: () => 'var i = 0;',
        validateRange: (range: vscode.Range) => range
      };

      openTextDocumentStub.resolves(mockDocument);
      showTextDocumentStub.resolves({
        document: mockDocument
      });

      const applyEditStub = sinon.stub(vscode.workspace, 'applyEdit').resolves(false);

      await fixSuggestionService.showFixSuggestion(params);

      expect(showInformationMessageStub.calledOnce).to.be.true;
      expect(showInformationMessageStub.firstCall.args[0]).to.equal('SonarQube for IDE: AI Fix declined.');
      expect(showInformationMessageStub.firstCall.args[1]).to.be.undefined; // No button
      expect(mockClient.fixSuggestionResolved.calledWith('fix-123', false)).to.be.true;

      applyEditStub.restore();
    });
  });

  suite('Fix Applied Successfully', () => {
    test('should show success message when fix is applied', async () => {
      const params: ExtendedClient.ShowFixSuggestionParams = {
        suggestionId: 'fix-123',
        fileUri: fileUri.toString(),
        explanation: 'Fix null pointer',
        textEdits: [{
          before: 'var i = 0;',
          after: 'let i = 0;',
          beforeLineRange: { startLine: 1, endLine: 1 }
        }],
        isLocal: true
      };

      const mockDocument = {
        getText: () => 'var i = 0;',
        validateRange: (range: vscode.Range) => range
      };

      openTextDocumentStub.resolves(mockDocument);
      showTextDocumentStub.resolves({
        document: mockDocument
      });

      const applyEditStub = sinon.stub(vscode.workspace, 'applyEdit').resolves(true);

      await fixSuggestionService.showFixSuggestion(params);

      expect(showInformationMessageStub.calledWith('SonarQube for IDE: AI Fix applied.')).to.be.true;
      expect(mockClient.fixSuggestionResolved.calledWith('fix-123', true)).to.be.true;

      applyEditStub.restore();
    });
  });

  suite('Error Handling', () => {
    test('should show error with View Fix Details option when exception occurs', async () => {
      const params: ExtendedClient.ShowFixSuggestionParams = {
        suggestionId: 'fix-123',
        fileUri: fileUri.toString(),
        explanation: 'Fix null pointer',
        textEdits: [{
          before: 'var i = 0;',
          after: 'let i = 0;',
          beforeLineRange: { startLine: 1, endLine: 1 }
        }],
        isLocal: true
      };

      const mockDocument = {
        getText: () => 'var i = 0;',
        validateRange: (range: vscode.Range) => range
      };

      openTextDocumentStub.resolves(mockDocument);
      showTextDocumentStub.rejects(new Error('Failed to open document'));
      showErrorMessageStub.resolves('View Fix Details');

      // The service should catch the error internally
      try {
        await fixSuggestionService.showFixSuggestion(params);
      } catch (err) {
        // If the service doesn't catch the error, we catch it here for test purposes
      }

      expect(showErrorMessageStub.calledOnce).to.be.true;
      expect(showErrorMessageStub.firstCall.args[0]).to.include('Failed to apply AI Fix');
      expect(showErrorMessageStub.firstCall.args[1]).to.equal('View Fix Details');
    });
  });

  suite('Markdown Content Formatting', () => {
    test('should include file extension in code blocks', async () => {
      const params: ExtendedClient.ShowFixSuggestionParams = {
        suggestionId: 'fix-123',
        fileUri: vscode.Uri.file(path.join(folder, 'test.ts')).toString(),
        explanation: 'Fix type error',
        textEdits: [{
          before: 'var x = 1;',
          after: 'const x: number = 1;',
          beforeLineRange: { startLine: 1, endLine: 1 }
        }],
        isLocal: true
      };

      showWarningMessageStub.resolves('View Fix Details');

      let markdownContent = '';
      openTextDocumentStub.callsFake((options: any) => {
        if (options && options.language === 'markdown') {
          markdownContent = options.content;
        }
        return Promise.resolve({
          getText: () => markdownContent
        });
      });
      showTextDocumentStub.resolves();

      const nonExistentUri = vscode.Uri.file(path.join(folder, 'test.ts'));
      const modifiedParams = {
        ...params,
        fileUri: nonExistentUri.toString()
      };

      await fixSuggestionService.showFixSuggestion(modifiedParams);

      expect(markdownContent).to.include('```ts');
      expect(markdownContent).to.include('**File:** `test.ts`');
    });

    test('should handle multiple text edits in markdown', async () => {
      const params: ExtendedClient.ShowFixSuggestionParams = {
        suggestionId: 'fix-123',
        fileUri: vscode.Uri.file(path.join(folder, 'test.js')).toString(),
        explanation: 'Multiple fixes',
        textEdits: [
          {
            before: 'var x = 1;',
            after: 'let x = 1;',
            beforeLineRange: { startLine: 1, endLine: 1 }
          },
          {
            before: 'var y = 2;',
            after: 'let y = 2;',
            beforeLineRange: { startLine: 2, endLine: 2 }
          }
        ],
        isLocal: true
      };

      showWarningMessageStub.resolves('View Fix Details');

      let markdownContent = '';
      openTextDocumentStub.callsFake((options: any) => {
        if (options && options.language === 'markdown') {
          markdownContent = options.content;
        }
        return Promise.resolve({
          getText: () => markdownContent
        });
      });
      showTextDocumentStub.resolves();

      const nonExistentUri = vscode.Uri.file(path.join(folder, 'test.js'));
      const modifiedParams = {
        ...params,
        fileUri: nonExistentUri.toString()
      };

      await fixSuggestionService.showFixSuggestion(modifiedParams);

      expect(markdownContent).to.include('## Change #1');
      expect(markdownContent).to.include('## Change #2');
      expect(markdownContent).to.include('var x = 1;');
      expect(markdownContent).to.include('var y = 2;');
    });
  });
});
