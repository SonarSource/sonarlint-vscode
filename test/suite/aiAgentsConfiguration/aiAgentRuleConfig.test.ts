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
import { introduceSonarQubeRulesFile, isSonarQubeRulesFileConfigured, openSonarQubeRulesFile } from '../../../src/aiAgentsConfiguration/aiAgentRuleConfig';
import * as aiAgentUtils from '../../../src/aiAgentsConfiguration/aiAgentUtils';
import { AGENT } from '../../../src/aiAgentsConfiguration/aiAgentUtils';
import { SETUP_TEARDOWN_HOOK_TIMEOUT } from '../commons';

suite('aiAgentRuleConfig', () => {
  let workspaceStub: sinon.SinonStub;
  let fsStub: sinon.SinonStub;
  let showErrorMessageStub: sinon.SinonStub;
  let showWarningMessageStub: sinon.SinonStub;
  let showInformationMessageStub: sinon.SinonStub;
  let showTextDocumentStub: sinon.SinonStub;
  let openTextDocumentStub: sinon.SinonStub;
  let executeCommandStub: sinon.SinonStub;
  let getCurrentAgentStub: sinon.SinonStub;

  setup(function () {
    this.timeout(SETUP_TEARDOWN_HOOK_TIMEOUT);
    workspaceStub = sinon.stub(vscode.workspace, 'workspaceFolders');
    fsStub = sinon.stub(vscode.workspace, 'fs');
    showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage');
    showWarningMessageStub = sinon.stub(vscode.window, 'showWarningMessage');
    showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage');
    showTextDocumentStub = sinon.stub(vscode.window, 'showTextDocument');
    openTextDocumentStub = sinon.stub(vscode.workspace, 'openTextDocument');
    executeCommandStub = sinon.stub(vscode.commands, 'executeCommand');
    getCurrentAgentStub = sinon.stub(aiAgentUtils, 'getCurrentAgentWithMCPSupport');
  });

  teardown(function () {
    this.timeout(SETUP_TEARDOWN_HOOK_TIMEOUT);
    sinon.restore();
  });

  suite('isSonarQubeRulesFileConfigured', () => {
    test('should return true when SonarQube rules file exists for Cursor', async () => {
        getCurrentAgentStub.returns(AGENT.CURSOR);
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
        const callArg = mockFs.stat.getCall(0).args[0];
        expect(callArg.path).to.include('.cursor/rules');
      });

    test('should return true when SonarQube rules file exists for Windsurf', async () => {
        getCurrentAgentStub.returns(AGENT.WINDSURF);
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
        const callArg = mockFs.stat.getCall(0).args[0];
        expect(callArg.path).to.include('.windsurf/rules');
      });

    test('should return true when SonarQube rules file exists for Kiro', async () => {
        getCurrentAgentStub.returns(AGENT.KIRO);
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
        const callArg = mockFs.stat.getCall(0).args[0];
        expect(callArg.path).to.include('.kiro/steering');
      });

    test('should return true when SonarQube rules file exists for GitHub Copilot', async () => {
        getCurrentAgentStub.returns(AGENT.GITHUB_COPILOT);
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
        const callArg = mockFs.stat.getCall(0).args[0];
        expect(callArg.path).to.include('.github/instructions');
      });
    
      test('should return false when SonarQube rules file does not exist', async () => {
        getCurrentAgentStub.returns(AGENT.CURSOR);
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

      test('should return false when agent is not supported', async () => {
        getCurrentAgentStub.returns(undefined);
        const mockWorkspaceFolder = {
          uri: vscode.Uri.file('/mock/workspace'),
          name: 'test-workspace',
          index: 0
        };
        workspaceStub.value([mockWorkspaceFolder]);
    
        const result = await isSonarQubeRulesFileConfigured();
    
        expect(result).to.be.false;
      });
  });

  suite('openSonarQubeRulesFile', () => {
    test('should show error when agent is not supported', async () => {
      getCurrentAgentStub.returns(undefined);
      workspaceStub.value([{ uri: vscode.Uri.file('/mock/workspace'), name: 'test-workspace', index: 0 }]);

      await openSonarQubeRulesFile();

      expect(showErrorMessageStub.calledOnce).to.be.true;
      expect(showErrorMessageStub.calledWith('Current agent does not support MCP Server configuration.')).to.be.true;
    });

    test('should show error when workspace folder cannot be found', async () => {
      getCurrentAgentStub.returns(AGENT.CURSOR);
      workspaceStub.value(undefined);

      await openSonarQubeRulesFile();

      expect(showErrorMessageStub.calledOnce).to.be.true;
      expect(showErrorMessageStub.calledWith('No workspace folder found. Please open a folder first.')).to.be.true;
    });

    test('should show warning and offer to create file when rules file does not exist', async () => {
      getCurrentAgentStub.returns(AGENT.CURSOR);
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

    test('should open and show text document when rules file exists for Cursor', async () => {
      getCurrentAgentStub.returns(AGENT.CURSOR);
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

    test('should open and show text document when rules file exists for GitHub Copilot', async () => {
      getCurrentAgentStub.returns(AGENT.GITHUB_COPILOT);
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
      
      const mockDocument = { uri: vscode.Uri.file('/mock/workspace/.github/instructions/sonarqube_mcp.instructions.md') };
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
    test('should show error when agent is not supported', async () => {
      getCurrentAgentStub.returns(undefined);

      const mockLanguageClient = {} as any;
      await introduceSonarQubeRulesFile(mockLanguageClient);

      expect(showErrorMessageStub.calledOnce).to.be.true;
      expect(showErrorMessageStub.calledWith('Current agent does not support MCP Server configuration.')).to.be.true;
    });

    test('should return early when user does not confirm', async () => {
      getCurrentAgentStub.returns(AGENT.CURSOR);
      showInformationMessageStub.resolves(undefined);

      const mockLanguageClient = {} as any;
      await introduceSonarQubeRulesFile(mockLanguageClient);

      // asking for confirmation
      expect(showInformationMessageStub.calledOnce).to.be.true;
      expect(workspaceStub.notCalled).to.be.true;
    });

    test('should show error when workspace folder does not exist', async () => {
      getCurrentAgentStub.returns(AGENT.CURSOR);
      showInformationMessageStub.resolves('OK');
      workspaceStub.value(undefined);

      const mockLanguageClient = {} as any;
      await introduceSonarQubeRulesFile(mockLanguageClient);

      expect(showInformationMessageStub.calledOnce).to.be.true;
      expect(showErrorMessageStub.calledOnce).to.be.true;
      expect(showErrorMessageStub.calledWith('No workspace folder found. Please open a folder first.')).to.be.true;
    });

    test('should create file for Cursor when user confirms and folder exists', async () => {
      getCurrentAgentStub.returns(AGENT.CURSOR);
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
      expect(mockLanguageClient.getMCPRulesFileContent.calledWith('cursor')).to.be.true;
    });

    test('should create file for Windsurf with correct path', async () => {
      getCurrentAgentStub.returns(AGENT.WINDSURF);
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

      const mockDocument = { uri: vscode.Uri.file('/mock/workspace/.windsurf/rules/sonarqube_mcp_instructions.mdc') };
      openTextDocumentStub.resolves(mockDocument);
      showTextDocumentStub.resolves();

      const mockLanguageClient = {
        getMCPRulesFileContent: sinon.stub().resolves({ content: 'test content' })
      } as any;

      await introduceSonarQubeRulesFile(mockLanguageClient);

      expect(mockLanguageClient.getMCPRulesFileContent.calledWith('windsurf')).to.be.true;
      const createDirCall = mockFs.createDirectory.getCall(0);
      expect(createDirCall.args[0].path).to.include('.windsurf/rules');
    });

    test('should create file for Kiro with correct path', async () => {
      getCurrentAgentStub.returns(AGENT.KIRO);
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

      const mockDocument = { uri: vscode.Uri.file('/mock/workspace/.kiro/steering/sonarqube_mcp_instructions.mdc') };
      openTextDocumentStub.resolves(mockDocument);
      showTextDocumentStub.resolves();

      const mockLanguageClient = {
        getMCPRulesFileContent: sinon.stub().resolves({ content: 'test content' })
      } as any;

      await introduceSonarQubeRulesFile(mockLanguageClient);

      expect(mockLanguageClient.getMCPRulesFileContent.calledWith('kiro')).to.be.true;
      const createDirCall = mockFs.createDirectory.getCall(0);
      expect(createDirCall.args[0].path).to.include('.kiro/steering');
    });

    test('should create file for GitHub Copilot with correct path and extension', async () => {
      getCurrentAgentStub.returns(AGENT.GITHUB_COPILOT);
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

      const mockDocument = { uri: vscode.Uri.file('/mock/workspace/.github/instructions/sonarqube_mcp.instructions.md') };
      openTextDocumentStub.resolves(mockDocument);
      showTextDocumentStub.resolves();

      const mockLanguageClient = {
        getMCPRulesFileContent: sinon.stub().resolves({ content: 'test content' })
      } as any;

      await introduceSonarQubeRulesFile(mockLanguageClient);

      expect(mockLanguageClient.getMCPRulesFileContent.calledWith('github_copilot')).to.be.true;
      const createDirCall = mockFs.createDirectory.getCall(0);
      expect(createDirCall.args[0].path).to.include('.github/instructions');
      const writeFileCall = mockFs.writeFile.getCall(0);
      expect(writeFileCall.args[0].path).to.include('.instructions.md');
    });
  });


});
