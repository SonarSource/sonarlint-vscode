/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { expect } from 'chai';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { AIAgentsConfigurationWebviewProvider } from '../../../src/aiAgentsConfiguration/aiAgentsConfigurationWebviewProvider';
import { AiIntegrationTelemetry } from '../../../src/aiAgentsConfiguration/aiIntegrationTelemetry';
import * as aiAgentUtils from '../../../src/aiAgentsConfiguration/aiAgentUtils';
import * as mcpServerConfig from '../../../src/aiAgentsConfiguration/mcpServerConfig';
import { ContextManager } from '../../../src/contextManager';
import { AiIntegration } from '../../../src/lsp/aiIntegrationProtocol';
import * as logging from '../../../src/util/logging';
import { SETUP_TEARDOWN_HOOK_TIMEOUT } from '../commons';

suite('AI integrations refresh publication', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let provider: any;
  let getIntegrationState: sinon.SinonStub;
  let setMcpSupported: sinon.SinonStub;
  let postMessage: sinon.SinonStub;

  function response(standaloneSupported = false): AiIntegration.GetAiIntegrationStateResponse {
    return {
      cli: {
        installationStatus: AiIntegration.CliInstallationStatus.INSTALLED,
        authenticationStatus: AiIntegration.CliAuthenticationStatus.AUTHENTICATED
      },
      agents: standaloneSupported ? [{
        agent: AiIntegration.AiAgent.CLAUDE_CODE,
        detectionSources: [AiIntegration.AiAgentDetectionSource.CLI],
        cliIntegrationSupported: true,
        standaloneMcpSupported: true
      }] : [],
      connectionChoices: []
    };
  }

  setup(function () {
    this.timeout(SETUP_TEARDOWN_HOOK_TIMEOUT);
    provider = Object.create(AIAgentsConfigurationWebviewProvider.prototype);
    provider.refreshGeneration = 0;
    provider.cliSetupSession = { operationInProgress: false };
    getIntegrationState = sinon.stub().resolves(response());
    provider.languageClient = {
      getAiIntegrationState: getIntegrationState,
      aiIntegrationAction: sinon.stub().resolves(),
      aiIntegrationCliStateObserved: sinon.stub().resolves(),
      aiAgentIntegrationStateObserved: sinon.stub().resolves()
    };
    provider.telemetry = new AiIntegrationTelemetry(provider.languageClient);
    postMessage = sinon.stub().resolves(true);
    provider.view = { webview: { postMessage } };
    setMcpSupported = sinon.stub(ContextManager.instance, 'setMCPServerSupportedAgentContext');
    sinon.stub(aiAgentUtils, 'getDetectedIdeAgents').returns([]);
    sinon.stub(vscode.env, 'remoteName').value(undefined);
    sinon.stub(mcpServerConfig, 'isMCPSetupInProgress').returns(false);
    sinon.stub(mcpServerConfig, 'inspectMCPConfiguration').resolves({
      state: AiIntegration.McpConfigurationState.STANDALONE,
      diagnostics: []
    });
    sinon.stub(logging, 'logToSonarLintOutput');
  });

  teardown(() => sinon.restore());

  test('building state does not change MCP command availability', async () => {
    getIntegrationState.resolves(response(true));

    await provider.buildState();

    expect(setMcpSupported.notCalled).to.be.true;
  });

  test('keeps CLI setup feedback on webview load and clears it on explicit refresh', async () => {
    const notice = { outcome: 'completed', message: 'Setup finished.' };
    provider.cliSetupSession.notice = notice;

    await provider.handleMessage({ command: 'ready' });
    expect(postMessage.firstCall.args[0].state.cli.notice).to.equal(notice);

    await provider.handleMessage({ command: 'refresh' });
    expect(provider.cliSetupSession.notice).to.be.undefined;
    expect(postMessage.secondCall.args[0].state.cli.notice).to.be.undefined;
  });

  test('shows a generic error state and recovers on a later refresh', async () => {
    getIntegrationState.onFirstCall().rejects(new Error('backend details'));

    await provider.refresh();
    await provider.refresh();

    expect(postMessage.firstCall.args).to.deep.equal([{ command: 'error' }]);
    expect(postMessage.secondCall.args[0].command).to.equal('state');
    expect(setMcpSupported.calledOnceWithExactly(false)).to.be.true;
    expect((logging.logToSonarLintOutput as sinon.SinonStub).calledOnceWith(
      'Could not refresh AI integrations state: Error: backend details'
    )).to.be.true;
  });

  test('does not reject when the view is disposed during publication', async () => {
    postMessage.rejects(new Error('Webview is disposed'));

    await provider.refresh();

    expect(postMessage.callCount).to.equal(2);
  });

  for (const standaloneSupported of [false, true]) {
    test(`a superseded refresh cannot ${standaloneSupported ? 'disable' : 'enable'} MCP commands and remains successful`, async () => {
      let completeOlder: (state: AiIntegration.GetAiIntegrationStateResponse) => void;
      getIntegrationState
        .onFirstCall().returns(new Promise(resolve => { completeOlder = resolve; }))
        .onSecondCall().resolves(response(standaloneSupported));

      const older = provider.refreshOnRequest();
      await provider.refresh();
      completeOlder(response(!standaloneSupported));
      await older;

      expect(postMessage.calledOnce).to.be.true;
      expect(postMessage.firstCall.args[0].state.mcp.configurableCount).to.equal(standaloneSupported ? 1 : 0);
      expect(setMcpSupported.calledOnceWithExactly(standaloneSupported)).to.be.true;
      const reports = provider.languageClient.aiIntegrationAction.getCalls().map(call => call.args[0]);
      expect(reports.map(report => report.status)).to.deep.equal(['STARTED', 'SUCCEEDED']);
      expect(provider.languageClient.aiIntegrationCliStateObserved.calledOnce).to.be.true;
    });
  }

  test('reports a failed manual refresh without publishing its error over a newer state', async () => {
    let rejectOlder: (error: Error) => void;
    getIntegrationState.onFirstCall().returns(new Promise((_resolve, reject) => { rejectOlder = reject; }));

    const older = provider.refreshOnRequest();
    await provider.refresh();
    rejectOlder(new Error('old request failed'));
    await older;

    expect(postMessage.calledOnce).to.be.true;
    expect(postMessage.firstCall.args[0].command).to.equal('state');
    expect(setMcpSupported.calledOnceWithExactly(false)).to.be.true;
    const reports = provider.languageClient.aiIntegrationAction.getCalls().map(call => call.args[0]);
    expect(reports.map(report => report.status)).to.deep.equal(['STARTED', 'FAILED']);
  });

  for (const outcome of ['success', 'error']) {
    test(`discards pending refresh ${outcome} after disposal or replacement of the view`, async () => {
      const replacementPostMessage = sinon.stub().resolves();
      for (const replacement of [undefined, { webview: { postMessage: replacementPostMessage } }]) {
        provider.view = { webview: { postMessage } };
        let settle: () => void;
        getIntegrationState.returns(new Promise((resolve, reject) => {
          settle = () => outcome === 'success' ? resolve(response(true)) : reject(new Error('disposed'));
        }));
        const pending = provider.refresh();
        provider.view = replacement;
        settle();
        await pending;
      }
      expect(postMessage.notCalled).to.be.true;
      expect(replacementPostMessage.notCalled).to.be.true;
      expect(setMcpSupported.notCalled).to.be.true;
    });
  }
});
