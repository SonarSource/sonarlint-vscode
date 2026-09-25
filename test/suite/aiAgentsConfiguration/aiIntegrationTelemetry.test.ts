/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { expect } from 'chai';
import * as sinon from 'sinon';
import { AiIntegrationTelemetry } from '../../../src/aiAgentsConfiguration/aiIntegrationTelemetry';
import * as aiAgentUtils from '../../../src/aiAgentsConfiguration/aiAgentUtils';
import { AiIntegration } from '../../../src/lsp/aiIntegrationProtocol';
import { SonarLintExtendedLanguageClient } from '../../../src/lsp/client';

suite('AiIntegrationTelemetry', () => {
  let action: sinon.SinonStub;
  let cliState: sinon.SinonStub;
  let agentState: sinon.SinonStub;
  let reporter: AiIntegrationTelemetry;

  setup(() => {
    sinon.stub(aiAgentUtils, 'getCurrentIdeHost').returns({
      id: AiIntegration.AiIntegrationHost.VSCODE,
      name: 'VS Code'
    });
    action = sinon.stub().resolves();
    cliState = sinon.stub().resolves();
    agentState = sinon.stub().resolves();
    reporter = new AiIntegrationTelemetry({
      aiIntegrationAction: action,
      aiIntegrationCliStateObserved: cliState,
      aiAgentIntegrationStateObserved: agentState
    } as unknown as SonarLintExtendedLanguageClient);
  });

  teardown(() => sinon.restore());

  test('sends the action notification fields', () => {
    reporter.action(AiIntegration.AiIntegrationAction.INTEGRATE_AGENT, {
      status: AiIntegration.AiIntegrationActionStatus.STARTED,
      agent: AiIntegration.AiAgent.CODEX
    });
    reporter.action(AiIntegration.AiIntegrationAction.INTEGRATE_AGENT, {
      status: AiIntegration.AiIntegrationActionStatus.FAILED
    });

    expect(action.firstCall.args[0]).to.deep.equal({
      action: 'INTEGRATE_AGENT',
      status: 'STARTED',
      agent: 'CODEX',
      host: 'VSCODE'
    });
    expect(action.secondCall.args[0]).to.deep.equal({
      action: 'INTEGRATE_AGENT',
      status: 'FAILED',
      agent: null,
      host: 'VSCODE'
    });
  });

  test('reports named CLI status enums', () => {
    reporter.cliState({
      installationStatus: AiIntegration.CliInstallationStatus.INSTALLED,
      authenticationStatus: AiIntegration.CliAuthenticationStatus.AUTHENTICATED,
      executablePath: '/ignored',
      serverUrl: 'https://ignored.example'
    });

    expect(cliState.firstCall.args[0]).to.deep.equal({
      installationStatus: 'INSTALLED',
      authenticationStatus: 'AUTHENTICATED',
      host: 'VSCODE'
    });
  });

  test('deduplicates agents and detection sources and reports unknown for uninspected MCP', () => {
    const capability = (sources: AiIntegration.AiAgentDetectionSource[]) => ({
      agent: AiIntegration.AiAgent.CLAUDE_CODE,
      detectionSources: sources,
      cliIntegrationSupported: true,
      standaloneMcpSupported: true,
      hookSupported: false,
      skillSupported: false
    });
    reporter.agentStates([
      capability([AiIntegration.AiAgentDetectionSource.CLI]),
      capability([AiIntegration.AiAgentDetectionSource.IDE, AiIntegration.AiAgentDetectionSource.CLI])
    ], new Map());

    expect(agentState.calledOnce).to.be.true;
    expect(agentState.firstCall.args[0]).to.deep.equal({
      agent: 'CLAUDE_CODE',
      detectionSources: ['IDE', 'CLI'],
      standaloneMcpState: 'UNKNOWN',
      host: 'VSCODE'
    });
  });

  test('does not let notification failures interrupt an action', () => {
    action.throws(new Error('transport failed'));
    expect(() => reporter.action(AiIntegration.AiIntegrationAction.REFRESH, {
      status: AiIntegration.AiIntegrationActionStatus.STARTED
    })).not.to.throw();
  });
});
