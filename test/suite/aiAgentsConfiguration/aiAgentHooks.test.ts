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
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  getCurrentAgentWithHookSupport,
  isHookInstalled,
  installHook,
  uninstallHook,
  openHookScript,
  openHookConfiguration
} from '../../../src/aiAgentsConfiguration/aiAgentHooks';
import { AGENT } from '../../../src/aiAgentsConfiguration/aiAgentUtils';
import { SonarLintExtendedLanguageClient } from '../../../src/lsp/client';

suite('aiAgentHooks', () => {
  let envStub: sinon.SinonStub;
  let homedirStub: sinon.SinonStub;
  let showErrorMessageStub: sinon.SinonStub;
  let showWarningMessageStub: sinon.SinonStub;
  let showInformationMessageStub: sinon.SinonStub;
  let showTextDocumentStub: sinon.SinonStub;
  let openTextDocumentStub: sinon.SinonStub;
  let executeCommandStub: sinon.SinonStub;
  let fsExistsSyncStub: sinon.SinonStub;
  let fsPromisesStub: any;

  setup(() => {
    envStub = sinon.stub(vscode.env, 'appName');
    homedirStub = sinon.stub(os, 'homedir').returns('/home/test'); // Default home directory for tests
    showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage');
    showWarningMessageStub = sinon.stub(vscode.window, 'showWarningMessage');
    showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage');
    showTextDocumentStub = sinon.stub(vscode.window, 'showTextDocument');
    openTextDocumentStub = sinon.stub(vscode.workspace, 'openTextDocument');
    executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();
    
    // Stub fs module
    fsExistsSyncStub = sinon.stub(fs, 'existsSync').returns(false);
    
    // Stub fs.promises
    fsPromisesStub = {
      mkdir: sinon.stub().resolves(),
      writeFile: sinon.stub().resolves(),
      readFile: sinon.stub().resolves('{"hooks":{}}'),
      chmod: sinon.stub().resolves(),
      readdir: sinon.stub().resolves([]),
      unlink: sinon.stub().resolves()
    };
    sinon.stub(fs, 'promises').value(fsPromisesStub);
  });

  teardown(() => {
    sinon.restore();
  });

  suite('getCurrentAgentWithHookSupport', () => {
    test('should return WINDSURF when app name contains windsurf next', () => {
      envStub.value('Windsurf Next');
      expect(getCurrentAgentWithHookSupport()).to.equal(AGENT.WINDSURF);
    });

    test('should return WINDSURF when app name contains windsurf next (case insensitive)', () => {
      envStub.value('WINDSURF NEXT Editor');
      expect(getCurrentAgentWithHookSupport()).to.equal(AGENT.WINDSURF);
    });

    test('should return WINDSURF for regular Windsurf', () => {
      envStub.value('Windsurf');
      expect(getCurrentAgentWithHookSupport()).to.equal(AGENT.WINDSURF);
    });

    test('should return undefined for Cursor (not yet supported)', () => {
      envStub.value('Cursor');
      expect(getCurrentAgentWithHookSupport()).to.be.undefined;
    });

    test('should return undefined for Cursor (case insensitive)', () => {
      envStub.value('CURSOR IDE');
      expect(getCurrentAgentWithHookSupport()).to.be.undefined;
    });

    test('should return undefined for Visual Studio Code', () => {
      envStub.value('Visual Studio Code');
      expect(getCurrentAgentWithHookSupport()).to.be.undefined;
    });

    test('should return undefined for unknown IDE', () => {
      envStub.value('Unknown IDE');
      expect(getCurrentAgentWithHookSupport()).to.be.undefined;
    });
  });

  suite('isHookInstalled', () => {
    test('should return false when agent is CURSOR (not supported)', async () => {
      const result = await isHookInstalled(AGENT.CURSOR);
      expect(result).to.be.false;
    });

    test('should return false when hooks.json does not exist', async () => {
      envStub.value('Windsurf Next');
      homedirStub.returns('/home/test');
      fsPromisesStub.readFile.rejects(new Error('File not found'));

      const result = await isHookInstalled(AGENT.WINDSURF);

      expect(result).to.be.false;
    });

    test('should return false when hooks.json exists but no SonarQube hook is installed', async () => {
      envStub.value('Windsurf Next');
      homedirStub.returns('/home/test');
      const config = {
        hooks: {
          post_write_code: [
            { command: '/some/other/command.sh', show_output: false }
          ]
        }
      };
      fsPromisesStub.readFile.resolves(JSON.stringify(config));

      const result = await isHookInstalled(AGENT.WINDSURF);

      expect(result).to.be.false;
    });

    test('should return true when SonarQube hook is installed', async () => {
      envStub.value('Windsurf');
      homedirStub.returns('/home/test');
      const config = {
        hooks: {
          post_write_code: [
            { 
              command: '/home/test/.codeium/windsurf/hooks/sonarqube_analysis_hook.js', 
              show_output: true 
            }
          ]
        }
      };
      fsPromisesStub.readFile.resolves(JSON.stringify(config));
      fsExistsSyncStub.withArgs(sinon.match.any).returns(true);

      const result = await isHookInstalled(AGENT.WINDSURF);

      expect(result).to.be.true;
    });

    test('should return true when SonarQube hook is installed (windsurf-next)', async () => {
      envStub.value('Windsurf Next');
      homedirStub.returns('/home/test');
      const config = {
        hooks: {
          post_write_code: [
            { 
              command: '/home/test/.codeium/windsurf-next/hooks/sonarqube_analysis_hook.py', 
              show_output: true 
            }
          ]
        }
      };
      fsPromisesStub.readFile.resolves(JSON.stringify(config));
      fsExistsSyncStub.withArgs(sinon.match.any).returns(true);

      const result = await isHookInstalled(AGENT.WINDSURF);

      expect(result).to.be.true;
    });
  });

  suite('installHook', () => {
    let mockLanguageClient: SonarLintExtendedLanguageClient;

    setup(() => {
      mockLanguageClient = {
        getAiAgentHookScriptContent: sinon.stub().resolves({
          scriptContent: '#!/usr/bin/env node\nconsole.log("test");',
          scriptFileName: 'sonarqube_analysis_hook.js',
          configContent: '{"hooks":{"post_write_code":[{"command":"{{SCRIPT_PATH}}","show_output":true}]}}',
          configFileName: 'hooks.json'
        })
      } as any;
    });

    test('should show error for unsupported agent', async () => {
      await installHook(mockLanguageClient, AGENT.CURSOR);

      expect(showErrorMessageStub.called).to.be.true;
      expect(showErrorMessageStub.args[0][0]).to.include('not supported');
    });

    (process.platform === 'win32' ? test.skip : test)('should install hook successfully for Windsurf when no existing hooks', async () => {
      envStub.value('Windsurf Next');
      homedirStub.returns('/home/test');
      fsPromisesStub.readFile.rejects(new Error('File not found'));

      await installHook(mockLanguageClient, AGENT.WINDSURF);

      expect(fsPromisesStub.mkdir.called).to.be.true;
      expect(fsPromisesStub.writeFile.called).to.be.true;
      expect(showInformationMessageStub.called).to.be.true;
      const infoMessage = showInformationMessageStub.args.find(args => 
        args[0] && args[0].includes('Hook script installed successfully')
      );
      expect(infoMessage).to.not.be.undefined;
      expect(executeCommandStub.calledWith('SonarLint.RefreshAIAgentsConfiguration')).to.be.true;
    });

    (process.platform === 'win32' ? test.skip : test)('should merge with existing hooks from other tools', async () => {
      envStub.value('Windsurf Next');
      homedirStub.returns('/home/test');
      const existingConfig = {
        hooks: {
          post_write_code: [
            { command: '/some/other/tool/command.sh', show_output: true }
          ]
        }
      };
      fsPromisesStub.readFile
        .onFirstCall().rejects(new Error('Not found')) // isHookInstalled check
        .onSecondCall().resolves(JSON.stringify(existingConfig)); // installHook read

      await installHook(mockLanguageClient, AGENT.WINDSURF);

      expect(fsPromisesStub.writeFile.calledTwice).to.be.true;
      const configWriteCall = fsPromisesStub.writeFile.getCall(1);
      const writtenConfig = JSON.parse(configWriteCall.args[1]);
      
      expect(writtenConfig.hooks.post_write_code).to.have.lengthOf(2);
      expect(writtenConfig.hooks.post_write_code[0].command).to.include('other/tool');
      expect(writtenConfig.hooks.post_write_code[1].command).to.include('sonarqube_analysis_hook');
    });

    test('should use windsurf-next directory when app name includes next', async () => {
      envStub.value('Windsurf Next');
      homedirStub.returns('/home/test');
      fsPromisesStub.readFile.rejects(new Error('File not found'));

      await installHook(mockLanguageClient, AGENT.WINDSURF);

      expect(fsPromisesStub.mkdir.called).to.be.true;
      const mkdirCall = fsPromisesStub.mkdir.getCalls().find(call => 
        call.args[0] && call.args[0].includes('windsurf-next')
      );
      expect(mkdirCall).to.not.be.undefined;
    });

    test('should set executable permissions on Unix systems', async () => {
      envStub.value('Windsurf Next');
      homedirStub.returns('/home/test');
      fsPromisesStub.readFile.rejects(new Error('File not found'));
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux' });

      try {
        await installHook(mockLanguageClient, AGENT.WINDSURF);

        expect(fsPromisesStub.chmod.calledOnce).to.be.true;
        expect(fsPromisesStub.chmod.calledWith(sinon.match.string, 0o700)).to.be.true;
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform });
      }
    });

    test('should not set executable permissions on Windows', async () => {
      envStub.value('Windsurf Next');
      homedirStub.returns('C:\\Users\\test');
      // homedir stubbed
      fsPromisesStub.readFile.rejects(new Error('File not found'));
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });

      try {
        await installHook(mockLanguageClient, AGENT.WINDSURF);

        expect(fsPromisesStub.chmod.called).to.be.false;
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform });
      }
    });

    test('should show error message on failure', async () => {
      envStub.value('Windsurf Next');
      homedirStub.returns('/home/test');
      fsPromisesStub.readFile.rejects(new Error('File not found'));
      fsPromisesStub.mkdir.rejects(new Error('Permission denied'));

      await installHook(mockLanguageClient, AGENT.WINDSURF);

      expect(showErrorMessageStub.calledOnce).to.be.true;
      expect(showErrorMessageStub.calledWith(sinon.match(/Failed to install hook script/))).to.be.true;
    });
  });

  suite('uninstallHook', () => {
    test('should show error for unsupported agent', async () => {
      await uninstallHook(AGENT.CURSOR);

      expect(showErrorMessageStub.called).to.be.true;
      expect(showErrorMessageStub.args[0][0]).to.include('not supported');
    });

    test('should show info message when no hook is installed', async () => {
      envStub.value('Windsurf Next');
      homedirStub.returns('/home/test');
      fsPromisesStub.readFile.rejects(new Error('File not found'));

      await uninstallHook(AGENT.WINDSURF);

      expect(showInformationMessageStub.calledOnce).to.be.true;
      expect(showInformationMessageStub.calledWith('No hook script found to uninstall.')).to.be.true;
    });

    test('should show error message on failure', async () => {
      envStub.value('Windsurf');
      homedirStub.returns('/home/test');
      const config = {
        hooks: {
          post_write_code: [
            { 
              command: '/home/test/.codeium/windsurf/hooks/sonarqube_analysis_hook.js', 
              show_output: true 
            }
          ]
        }
      };
      fsPromisesStub.readFile.resolves(JSON.stringify(config));
      fsExistsSyncStub.withArgs(sinon.match.any).returns(true);
      fsPromisesStub.writeFile.rejects(new Error('Permission denied'));
      showWarningMessageStub.resolves('Uninstall');

      await uninstallHook(AGENT.WINDSURF);

      expect(showErrorMessageStub.called).to.be.true;
      const errorMessage = showErrorMessageStub.args.find(args => 
        args[0] && args[0].includes('Failed to uninstall hook script')
      );
      expect(errorMessage).to.not.be.undefined;
    });
  });

  suite('openHookScript', () => {
    test('should show error for unsupported agent', async () => {
      await openHookScript(AGENT.CURSOR);

      expect(showErrorMessageStub.called).to.be.true;
      expect(showErrorMessageStub.args[0][0]).to.include('not supported');
    });

    test('should show info message when no hook is found', async () => {
      envStub.value('Windsurf Next');
      homedirStub.returns('/home/test');
      fsPromisesStub.readFile.rejects(new Error('File not found'));

      await openHookScript(AGENT.WINDSURF);

      expect(showInformationMessageStub.calledOnce).to.be.true;
      expect(showInformationMessageStub.calledWith('No hook script found. Please install it first.')).to.be.true;
    });

    test('should open hook script when it exists', async () => {
      envStub.value('Windsurf Next');
      homedirStub.returns('/home/test');
      const config = {
        hooks: {
          post_write_code: [
            { 
              command: '/home/test/.codeium/windsurf/hooks/sonarqube_analysis_hook.js', 
              show_output: true 
            }
          ]
        }
      };
      fsPromisesStub.readFile.resolves(JSON.stringify(config));
      const mockDocument = { uri: vscode.Uri.file('/home/test/.codeium/windsurf/hooks/sonarqube_analysis_hook.js') };
      openTextDocumentStub.resolves(mockDocument);
      showTextDocumentStub.resolves();

      await openHookScript(AGENT.WINDSURF);

      expect(openTextDocumentStub.calledOnce).to.be.true;
      expect(openTextDocumentStub.calledWith('/home/test/.codeium/windsurf/hooks/sonarqube_analysis_hook.js')).to.be.true;
      expect(showTextDocumentStub.calledOnce).to.be.true;
      expect(showTextDocumentStub.calledWith(mockDocument)).to.be.true;
    });

    test('should show error message on failure', async () => {
      envStub.value('Windsurf');
      homedirStub.returns('/home/test');
      const config = {
        hooks: {
          post_write_code: [
            { 
              command: '/home/test/.codeium/windsurf/hooks/sonarqube_analysis_hook.js', 
              show_output: true 
            }
          ]
        }
      };
      fsPromisesStub.readFile.resolves(JSON.stringify(config));
      openTextDocumentStub.rejects(new Error('Permission denied'));

      await openHookScript(AGENT.WINDSURF);

      expect(showErrorMessageStub.called).to.be.true;
      const errorMessage = showErrorMessageStub.args.find(args => 
        args[0] && args[0].includes('Failed to open hook script')
      );
      expect(errorMessage).to.not.be.undefined;
    });
  });

  suite('openHookConfiguration', () => {
    test('should show error for unsupported agent', async () => {
      await openHookConfiguration(AGENT.CURSOR);

      expect(showErrorMessageStub.called).to.be.true;
      expect(showErrorMessageStub.args[0][0]).to.include('not supported');
    });

    test('should show info message when configuration file does not exist', async () => {
      envStub.value('Windsurf Next');
      homedirStub.returns('/home/test');
      fsExistsSyncStub.returns(false);

      await openHookConfiguration(AGENT.WINDSURF);

      expect(showInformationMessageStub.calledOnce).to.be.true;
      expect(showInformationMessageStub.calledWith('No hook configuration found. Please install the hook first.')).to.be.true;
    });

    test('should open configuration file when it exists', async () => {
      envStub.value('Windsurf Next');
      homedirStub.returns('/home/test');
      fsExistsSyncStub.withArgs(sinon.match.any).returns(true);
      const mockDocument = { uri: vscode.Uri.file('/home/test/.codeium/windsurf/hooks.json') };
      openTextDocumentStub.resolves(mockDocument);
      showTextDocumentStub.resolves();

      await openHookConfiguration(AGENT.WINDSURF);

      expect(fsExistsSyncStub.calledOnce).to.be.true;
      expect(openTextDocumentStub.calledOnce).to.be.true;
      expect(showTextDocumentStub.calledOnce).to.be.true;
      expect(showTextDocumentStub.calledWith(mockDocument)).to.be.true;
    });

    test('should use windsurf-next path when appropriate', async () => {
      envStub.value('Windsurf Next');
      homedirStub.returns('/home/test');
      fsExistsSyncStub.withArgs(sinon.match.any).returns(true);
      const mockDocument = { uri: vscode.Uri.file('/home/test/.codeium/windsurf-next/hooks.json') };
      openTextDocumentStub.resolves(mockDocument);
      showTextDocumentStub.resolves();

      await openHookConfiguration(AGENT.WINDSURF);

      expect(fsExistsSyncStub.calledOnce).to.be.true;
      const callArg = fsExistsSyncStub.getCall(0).args[0];
      expect(callArg).to.include('windsurf-next');
    });

    test('should show error message on failure', async () => {
      envStub.value('Windsurf Next');
      homedirStub.returns('/home/test');
      fsExistsSyncStub.withArgs(sinon.match.any).returns(true);
      openTextDocumentStub.rejects(new Error('Permission denied'));

      await openHookConfiguration(AGENT.WINDSURF);

      expect(showErrorMessageStub.calledOnce).to.be.true;
      expect(showErrorMessageStub.calledWith(sinon.match(/Failed to open hook configuration/))).to.be.true;
    });
  });
});

