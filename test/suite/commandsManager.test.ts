/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { expect } from 'chai';
import { ExtendedServer } from '../../src/lsp/protocol';
import { Commands } from '../../src/util/commands';
import { LanguageClient } from 'vscode-languageclient/lib/node/main';

suite('ANALYZE_VCS_CHANGED_FILES command', () => {
  const FINDINGS_FOCUS_COMMAND = 'SonarQube.Findings.focus';
  let sendNotificationSpy: sinon.SinonSpy;
  let executeCommandSpy: sinon.SinonSpy;
  let workspaceFoldersStub: sinon.SinonStub;
  let showWarningMessageStub: sinon.SinonStub;

  setup(() => {
    sendNotificationSpy = sinon.spy(LanguageClient.prototype, 'sendNotification');
    executeCommandSpy = sinon.spy(vscode.commands, 'executeCommand');
    workspaceFoldersStub = sinon.stub(vscode.workspace, 'workspaceFolders');
    showWarningMessageStub = sinon.stub(vscode.window, 'showWarningMessage');
  });

  teardown(() => {
    sinon.restore();
  });

  test('should send notification with workspace folder URIs when workspace folders exist', () => {
    const mockFolder1 = vscode.Uri.file('/path/to/folder1');
    const mockFolder2 = vscode.Uri.file('/path/to/folder2');
    const mockWorkspaceFolders: vscode.WorkspaceFolder[] = [
      { uri: mockFolder1, name: 'folder1', index: 0 },
      { uri: mockFolder2, name: 'folder2', index: 1 }
    ];

    workspaceFoldersStub.value(mockWorkspaceFolders);

    vscode.commands.executeCommand(Commands.ANALYZE_VCS_CHANGED_FILES);

    expect(sendNotificationSpy.calledOnce).to.be.true;
    expect(sendNotificationSpy.firstCall.args[0]).to.equal(ExtendedServer.AnalyzeVCSChangedFiles.type);
    
    const notificationParams = sendNotificationSpy.firstCall.args[1];
    expect(notificationParams).to.have.property('configScopeIds');
    expect(notificationParams.configScopeIds).to.be.an('array');
    expect(notificationParams.configScopeIds).to.have.lengthOf(2);
  });

  test('should send notification with undefined when no workspace folders exist', () => {
    workspaceFoldersStub.value(undefined);

    vscode.commands.executeCommand(Commands.ANALYZE_VCS_CHANGED_FILES);

    expect(sendNotificationSpy.called).to.be.false;
    expect(showWarningMessageStub.called).to.be.true;
    expect(showWarningMessageStub.firstCall.args[0]).to.equal('No workspace folders found; Ignoring request to analyze VCS changed files.');
  });

  test('should focus on findings view after sending notification', () => {
    const mockFolder = vscode.Uri.file('/path/to/folder');
    const mockWorkspaceFolders: vscode.WorkspaceFolder[] = [
      { uri: mockFolder, name: 'folder', index: 0 }
    ];

    workspaceFoldersStub.value(mockWorkspaceFolders);

    vscode.commands.executeCommand(Commands.ANALYZE_VCS_CHANGED_FILES);

    expect(executeCommandSpy.calledWith(FINDINGS_FOCUS_COMMAND)).to.be.true;
  });
});

