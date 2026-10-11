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

    expect(result).to.deep.equal({ outcome: { status: 'CANCELLED' } });
    expect(getState.notCalled).to.be.true;
    expect(confirm.notCalled).to.be.true;
    expect(uninstall.notCalled).to.be.true;
  });

  test('returns cancellation after preflight disposal without opening confirmation', async () => {
    const disposed = sinon.stub().onFirstCall().returns(false).onSecondCall().returns(true);

    const result = await runCliUninstall(client, disposed);

    expect(result).to.deep.equal({ outcome: { status: 'CANCELLED' } });
    expect(getState.calledOnce).to.be.true;
    expect(confirm.notCalled).to.be.true;
    expect(uninstall.notCalled).to.be.true;
  });

  test('returns an explicit unknown outcome without a notice for an absent response', async () => {
    uninstall.resolves(undefined);

    const result = await runCliUninstall(client, () => false);

    expect(result).to.deep.equal({ outcome: { status: 'UNKNOWN' } });
  });

  for (const platform of ['win32', 'linux', 'darwin'] as const) {
    test(`shows manual PATH cleanup instructions after uninstall on ${platform}`, async () => {
      sinon.stub(os, 'platform').returns(platform);

      const result = await runCliUninstall(client, () => false);

      expect(result.notice.message).to.include('Reopen terminals.');
      if (platform === 'win32') {
        expect(result.notice.message).to.include('%LOCALAPPDATA%\\sonarqube-cli\\bin')
          .and.include('user Path in Environment Variables').and.not.include('~/.bashrc');
      } else {
        expect(result.notice.message).to.include('$HOME/.local/share/sonarqube-cli/bin')
          .and.include('~/.bashrc').and.include('~/.zshrc').and.not.include('%LOCALAPPDATA%');
      }
    });
  }

  for (const [status, expected] of [
    [AiIntegration.UninstallCliStatus.UNINSTALLED, AiIntegration.AiIntegrationActionStatus.SUCCEEDED],
    [AiIntegration.UninstallCliStatus.NOT_AVAILABLE, AiIntegration.AiIntegrationActionStatus.FAILED],
    [AiIntegration.UninstallCliStatus.FAILED, AiIntegration.AiIntegrationActionStatus.FAILED],
    [99, AiIntegration.AiIntegrationActionStatus.UNKNOWN],
    [undefined, AiIntegration.AiIntegrationActionStatus.UNKNOWN]
  ] as const) {
    test(`returns explicit ${expected} for backend status ${status}`, async () => {
      uninstall.resolves({ status, stdout: '', stderr: 'Cleanup diagnostic', message: 'Backend diagnostic' });

      const result = await runCliUninstall(client, () => false);

      expect(result.outcome).to.deep.equal({ status: expected });
      expect(result.notice).not.to.be.undefined;
    });
  }
});
