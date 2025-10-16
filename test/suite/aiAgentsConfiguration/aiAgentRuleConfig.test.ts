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
import { introduceSonarQubeRulesFile, isSonarQubeRulesFileConfigured, openSonarQubeRulesFile } from '../../../src/aiAgentsConfiguration/aiAgentRuleConfig';

suite('aiAgentRuleConfig', () => {
  let workspaceStub: sinon.SinonStub;
  let fsStub: sinon.SinonStub;
  let showErrorMessageStub: sinon.SinonStub;
  let showWarningMessageStub: sinon.SinonStub;
  let showInformationMessageStub: sinon.SinonStub;
  let showTextDocumentStub: sinon.SinonStub;
  let openTextDocumentStub: sinon.SinonStub;
  let executeCommandStub: sinon.SinonStub;

  setup(() => {
    workspaceStub = sinon.stub(vscode.workspace, 'workspaceFolders');
    fsStub = sinon.stub(vscode.workspace, 'fs');
    showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage');
    showWarningMessageStub = sinon.stub(vscode.window, 'showWarningMessage');
    showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage');
    showTextDocumentStub = sinon.stub(vscode.window, 'showTextDocument');
    openTextDocumentStub = sinon.stub(vscode.workspace, 'openTextDocument');
    executeCommandStub = sinon.stub(vscode.commands, 'executeCommand');
  });

  teardown(() => {
    sinon.restore();
  });

  suite('isSonarQubeRulesFileConfigured', () => {
    test('should return true when SonarQube rules file exists', async () => {
        const mockWorkspaceFolder = {
          uri: vscode.Uri.file('/mock/workspace'),
          name: 'test-workspace',
          index: 0
        };
        workspaceStub.value([mockWorkspaceFolder]);
        
        const mockFs = {
          stat: sinon.stub().resolves({ type: vscode.FileType.File, ctime: 0, mtime: 0, size: 100 })
        };
        fsStub.value(mockFs);
    
        const result = await isSonarQubeRulesFileConfigured();
    
        expect(result).to.be.true;
        expect(mockFs.stat.calledOnce).to.be.true;
      });
    
      test('should return false when SonarQube rules file does not exist', async () => {
        const mockWorkspaceFolder = {
          uri: vscode.Uri.file('/mock/workspace'),
          name: 'test-workspace',
          index: 0
        };
        workspaceStub.value([mockWorkspaceFolder]);
        
        const mockFs = {
          stat: sinon.stub().rejects(new Error('File not found'))
        };
        fsStub.value(mockFs);
    
        const result = await isSonarQubeRulesFileConfigured();
    
        expect(result).to.be.false;
        expect(mockFs.stat.calledOnce).to.be.true;
      });
  });

  suite('openSonarQubeRulesFile', () => {
    test('should show error when workspace folder cannot be found', async () => {
      workspaceStub.value(undefined);

      await openSonarQubeRulesFile();

      expect(showErrorMessageStub.calledOnce).to.be.true;
      expect(showErrorMessageStub.calledWith('No workspace folder found. Please open a folder first.')).to.be.true;
    });

    test('should show warning and offer to create file when rules file does not exist', async () => {
      const mockWorkspaceFolder = {
        uri: vscode.Uri.file('/mock/workspace'),
        name: 'test-workspace',
        index: 0
      };
      workspaceStub.value([mockWorkspaceFolder]);
      
      const mockFs = {
        stat: sinon.stub().rejects(new Error('File not found'))
      };
      fsStub.value(mockFs);
      showWarningMessageStub.resolves('Create Rules File');

      await openSonarQubeRulesFile();

      expect(mockFs.stat.calledOnce).to.be.true;
      expect(showWarningMessageStub.calledOnce).to.be.true;
      expect(showWarningMessageStub.calledWith(
        'SonarQube rules file not found. Would you like to create one?',
        'Create Rules File'
      )).to.be.true;
      expect(executeCommandStub.calledOnce).to.be.true;
      expect(executeCommandStub.calledWith('SonarLint.IntroduceSonarQubeRulesFile')).to.be.true;
    });

    test('should open and show text document when rules file exists', async () => {
      const mockWorkspaceFolder = {
        uri: vscode.Uri.file('/mock/workspace'),
        name: 'test-workspace',
        index: 0
      };
      workspaceStub.value([mockWorkspaceFolder]);
      
      const mockFs = {
        stat: sinon.stub().resolves({ type: vscode.FileType.File, ctime: 0, mtime: 0, size: 100 })
      };
      fsStub.value(mockFs);
      
      const mockDocument = { uri: vscode.Uri.file('/mock/workspace/.cursor/rules/sonarqube_mcp_instructions.mdc') };
      openTextDocumentStub.resolves(mockDocument);
      showTextDocumentStub.resolves();

      await openSonarQubeRulesFile();

      expect(mockFs.stat.calledOnce).to.be.true;
      expect(openTextDocumentStub.calledOnce).to.be.true;
      expect(showTextDocumentStub.calledOnce).to.be.true;
      expect(showTextDocumentStub.calledWith(mockDocument)).to.be.true;
    });
  });

  suite('introduceSonarQubeRulesFile', () => {
    test('should return early when user does not confirm', async () => {
      showInformationMessageStub.resolves(undefined);

      const mockLanguageClient = {} as any;
      await introduceSonarQubeRulesFile(mockLanguageClient);

      // asking for confirmation
      expect(showInformationMessageStub.calledOnce).to.be.true;
      expect(workspaceStub.notCalled).to.be.true;
    });

    test('should show error when workspace folder does not exist', async () => {
      showInformationMessageStub.resolves('OK');
      workspaceStub.value(undefined);

      const mockLanguageClient = {} as any;
      await introduceSonarQubeRulesFile(mockLanguageClient);

      expect(showInformationMessageStub.calledOnce).to.be.true;
      expect(showErrorMessageStub.calledOnce).to.be.true;
      expect(showErrorMessageStub.calledWith('No workspace folder found. Please open a folder first.')).to.be.true;
    });

    test('should create file when user confirms and folder exists', async () => {
      showInformationMessageStub.resolves('OK');
      const mockWorkspaceFolder = {
        uri: vscode.Uri.file('/mock/workspace'),
        name: 'test-workspace',
        index: 0
      };
      workspaceStub.value([mockWorkspaceFolder]);

      const mockFs = {
        stat: sinon.stub().rejects(new Error('Directory not found')),
        createDirectory: sinon.stub().resolves(),
        writeFile: sinon.stub().resolves()
      };
      fsStub.value(mockFs);

      const mockDocument = { uri: vscode.Uri.file('/mock/workspace/.cursor/rules/sonarqube_mcp_instructions.mdc') };
      openTextDocumentStub.resolves(mockDocument);
      showTextDocumentStub.resolves();

      const mockLanguageClient = {
        getMCPRulesFileContent: sinon.stub().resolves({ content: 'test content' })
      } as any;

      await introduceSonarQubeRulesFile(mockLanguageClient);

      // one for confirmation, one for success message
      expect(showInformationMessageStub.calledTwice).to.be.true;
      expect(mockFs.createDirectory.calledOnce).to.be.true;
      expect(mockFs.writeFile.calledOnce).to.be.true;
      expect(openTextDocumentStub.calledOnce).to.be.true;
      expect(showTextDocumentStub.calledOnce).to.be.true;
    });
  });


});