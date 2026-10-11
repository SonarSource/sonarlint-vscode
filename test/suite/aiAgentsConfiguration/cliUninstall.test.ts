/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { expect } from 'chai';
import os from 'node:os';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { runCliUninstall } from '../../../src/aiAgentsConfiguration/cliUninstall';
import { AiIntegration } from '../../../src/lsp/aiIntegrationProtocol';
import { SonarLintExtendedLanguageClient } from '../../../src/lsp/client';
import * as logging from '../../../src/util/logging';

suite('cliUninstall', () => {
  let client: SonarLintExtendedLanguageClient;
  let getState: sinon.SinonStub;
  let uninstall: sinon.SinonStub;
  let confirm: sinon.SinonStub;
  let cancellation: vscode.CancellationTokenSource;

  setup(() => {
    getState = sinon.stub().resolves({ cli: { uninstallAvailable: true } });
    uninstall = sinon.stub().resolves({ status: AiIntegration.UninstallCliStatus.UNINSTALLED, stdout: '', stderr: '' });
    client = { getAiIntegrationState: getState, uninstallCli: uninstall } as unknown as SonarLintExtendedLanguageClient;
    confirm = sinon.stub(vscode.window, 'showWarningMessage').resolves('Uninstall' as never);
    cancellation = new vscode.CancellationTokenSource();
    sinon.stub(vscode.window, 'withProgress')
      .callsFake((_options, task) => task({ report: sinon.stub() }, cancellation.token));
    sinon.stub(logging, 'logToSonarLintOutput');
  });

  teardown(() => {
    cancellation.dispose();
    sinon.restore();
  });

  test('returns cancellation without a notice or preflight when already disposed', async () => {
    const result = await runCliUninstall(client, () => true);

    expect(result).to.be.undefined;
    expect(getState.notCalled).to.be.true;
    expect(confirm.notCalled).to.be.true;
    expect(uninstall.notCalled).to.be.true;
  });

  test('returns cancellation after preflight disposal without opening confirmation', async () => {
    const disposed = sinon.stub().onFirstCall().returns(false).onSecondCall().returns(true);

    const result = await runCliUninstall(client, disposed);

    expect(result).to.be.undefined;
    expect(getState.calledOnce).to.be.true;
    expect(confirm.notCalled).to.be.true;
    expect(uninstall.notCalled).to.be.true;
  });

  test('returns no notice for an absent response', async () => {
    uninstall.resolves(undefined);

    const result = await runCliUninstall(client, () => false);

    expect(result).to.be.undefined;
  });

  for (const platform of ['win32', 'linux', 'darwin'] as const) {
    test(`shows manual PATH cleanup instructions after uninstall on ${platform}`, async () => {
      sinon.stub(os, 'platform').returns(platform);

      const result = await runCliUninstall(client, () => false);

      expect(result.message).to.include('Reopen terminals.');
      if (platform === 'win32') {
        expect(result.message).to.include('%LOCALAPPDATA%\\sonarqube-cli\\bin')
          .and.include('user Path in Environment Variables').and.not.include('~/.bashrc');
      } else {
        expect(result.message).to.include('$HOME/.local/share/sonarqube-cli/bin')
          .and.include('~/.bashrc').and.include('~/.zshrc').and.not.include('%LOCALAPPDATA%');
      }
    });
  }
});
