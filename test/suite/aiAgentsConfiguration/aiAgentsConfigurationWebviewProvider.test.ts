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
import * as aiAgentHooks from '../../../src/aiAgentsConfiguration/aiAgentHooks';
import * as aiAgentRuleConfig from '../../../src/aiAgentsConfiguration/aiAgentRuleConfig';
import * as aiAgentUtils from '../../../src/aiAgentsConfiguration/aiAgentUtils';
import { INTEGRATION_TARGET, IDE_HOST } from '../../../src/aiAgentsConfiguration/aiAgentUtils';
import * as mcpServerConfig from '../../../src/aiAgentsConfiguration/mcpServerConfig';
import { ExtendedServer } from '../../../src/lsp/protocol';
import { Commands } from '../../../src/util/commands';
import { SETUP_TEARDOWN_HOOK_TIMEOUT } from '../commons';

suite('AIAgentsConfigurationWebviewProvider', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let provider: any;
  let getIntegrationState: sinon.SinonStub;

  setup(function () {
    this.timeout(SETUP_TEARDOWN_HOOK_TIMEOUT);
    provider = Object.create(AIAgentsConfigurationWebviewProvider.prototype);
    getIntegrationState = sinon.stub().resolves({
      cli: {
        installationStatus: ExtendedServer.CliInstallationStatus.NOT_INSTALLED,
        authenticationStatus: ExtendedServer.CliAuthenticationStatus.UNKNOWN
      },
      agents: [],
      connectionChoices: []
    });
    provider.aiIntegrationService = { getIntegrationState };
  });

  teardown(() => sinon.restore());

  test('builds the CLI and MCP card state', async () => {
    sinon.stub(aiAgentUtils, 'getCurrentIdeHost').returns({ id: IDE_HOST.VS_CODE, name: 'VS Code' });
    sinon.stub(aiAgentUtils, 'getCurrentIntegrationTargetWithMCPSupport').returns(INTEGRATION_TARGET.GITHUB_COPILOT);
    sinon.stub(aiAgentUtils, 'getCurrentIntegrationTargetWithHookSupport').returns(undefined);
    sinon.stub(aiAgentUtils, 'getDetectedIdeAgents').returns([
      {
        id: INTEGRATION_TARGET.CODEX,
        name: 'Codex',
        source: 'extension'
      }
    ]);
    getIntegrationState.resolves({
      cli: {
        installationStatus: ExtendedServer.CliInstallationStatus.INSTALLED,
        authenticationStatus: ExtendedServer.CliAuthenticationStatus.AUTHENTICATED
      },
      agents: [
        {
          agent: ExtendedServer.AiAgent.CODEX,
          cliIntegrationSupported: false,
          standaloneMcpSupported: true,
          hookSupported: true,
          skillSupported: true
        }
      ],
      connectionChoices: []
    });
    sinon.stub(aiAgentRuleConfig, 'isSonarQubeRulesFileConfigured').resolves(true);
    sinon.stub(mcpServerConfig, 'getCurrentSonarQubeMCPServerConfig').returns({
      command: 'docker',
      args: ['run'],
      env: {}
    });

    const state = await provider.buildState();

    expect(state.ideName).to.equal('VS Code');
    expect(
      getIntegrationState.calledOnceWithExactly(
        IDE_HOST.VS_CODE,
        [INTEGRATION_TARGET.CODEX],
        ExtendedServer.AiIntegrationScope.GLOBAL
      )
    ).to.be.true;
    expect(state.agents[0].supportsCliIntegration).to.be.false;
    expect(state.cli).to.deep.equal({
      installationStatus: 'INSTALLED',
      hook: { supported: false, configured: false }
    });
    expect(state.mcp).to.deep.equal({
      supported: true,
      configured: true,
      agentName: undefined,
      legacyInstructionsConfigured: true
    });
  });

  test('includes the current IDE hook state and hides absent legacy instructions', async () => {
    sinon.stub(aiAgentUtils, 'getCurrentIdeHost').returns({ id: IDE_HOST.WINDSURF, name: 'Windsurf' });
    sinon.stub(aiAgentUtils, 'getCurrentIntegrationTargetWithMCPSupport').returns(INTEGRATION_TARGET.WINDSURF);
    sinon.stub(aiAgentUtils, 'getCurrentIntegrationTargetWithHookSupport').returns(INTEGRATION_TARGET.WINDSURF);
    sinon.stub(aiAgentUtils, 'getDetectedIdeAgents').returns([]);
    sinon.stub(aiAgentRuleConfig, 'isSonarQubeRulesFileConfigured').resolves(false);
    sinon.stub(aiAgentHooks, 'isHookInstalled').resolves(true);
    sinon.stub(mcpServerConfig, 'getCurrentSonarQubeMCPServerConfig').returns(undefined);

    const state = await provider.buildState();

    expect(state.cli).to.deep.equal({
      installationStatus: 'NOT_INSTALLED',
      hook: { supported: true, configured: true }
    });
    expect(state.mcp.legacyInstructionsConfigured).to.be.false;
  });

  test('preserves an unusable CLI status without enabling unsupported local integrations', async () => {
    sinon.stub(aiAgentUtils, 'getCurrentIdeHost').returns({ id: IDE_HOST.VS_CODE, name: 'VS Code' });
    sinon.stub(aiAgentUtils, 'getCurrentIntegrationTargetWithMCPSupport').returns(undefined);
    sinon.stub(aiAgentUtils, 'getCurrentIntegrationTargetWithHookSupport').returns(undefined);
    sinon
      .stub(aiAgentUtils, 'getDetectedIdeAgents')
      .returns([{ id: INTEGRATION_TARGET.CODEX, name: 'Codex', source: 'extension' }]);
    sinon.stub(aiAgentRuleConfig, 'isSonarQubeRulesFileConfigured').resolves(false);
    sinon.stub(mcpServerConfig, 'getCurrentSonarQubeMCPServerConfig').returns(undefined);
    getIntegrationState.resolves({
      cli: {
        installationStatus: ExtendedServer.CliInstallationStatus.UNUSABLE,
        authenticationStatus: ExtendedServer.CliAuthenticationStatus.UNKNOWN
      },
      agents: [
        {
          agent: ExtendedServer.AiAgent.CODEX,
          cliIntegrationSupported: true,
          standaloneMcpSupported: true,
          hookSupported: true,
          skillSupported: true
        }
      ],
      connectionChoices: []
    });

    const state = await provider.buildState();

    expect(state.cli).to.deep.equal({
      installationStatus: 'UNUSABLE',
      hook: { supported: false, configured: false }
    });
    expect(state.agents[0].supportsCliIntegration).to.be.true;
    expect(state.mcp.supported).to.be.false;
  });

  test('shows a generic error state and recovers on a later refresh', async () => {
    const postMessage = sinon.stub().resolves();
    const state = { cli: { installationStatus: 'INSTALLED' } };
    provider.view = { webview: { postMessage } };
    provider.buildState = sinon
      .stub()
      .onFirstCall()
      .rejects(new Error('backend details'))
      .onSecondCall()
      .resolves(state);

    await provider.refresh();
    await provider.refresh();

    expect(postMessage.firstCall.args).to.deep.equal([{ command: 'error' }]);
    expect(postMessage.secondCall.args).to.deep.equal([{ command: 'state', state }]);
  });

  test('routes MCP setup through the existing command and refreshes state', async () => {
    const executeCommand = sinon.stub(vscode.commands, 'executeCommand').resolves();
    provider.refresh = sinon.stub().resolves();

    await provider.handleMessage({ command: 'configureMcp' });

    expect(executeCommand.calledOnceWith(Commands.CONFIGURE_MCP_SERVER)).to.be.true;
    expect(provider.refresh.calledOnce).to.be.true;
  });

  test('opens hook configuration from the CLI card', async () => {
    const executeCommand = sinon.stub(vscode.commands, 'executeCommand').resolves();

    await provider.handleMessage({ command: 'openHook' });

    expect(executeCommand.calledOnceWith(Commands.OPEN_AI_AGENT_HOOK_CONFIGURATION)).to.be.true;
  });

  test('opens the Vortex documentation from the CLI card', async () => {
    const openExternal = sinon.stub(vscode.env, 'openExternal').resolves(true);

    await provider.handleMessage({ command: 'openVortexDocumentation' });

    expect(openExternal.calledOnceWith(vscode.Uri.parse('https://www.sonarsource.com/blog/introducing-sonar-vortex/')))
      .to.be.true;
  });

  test('opens only existing legacy instructions and refreshes stale state', async () => {
    const executeCommand = sinon.stub(vscode.commands, 'executeCommand').resolves();
    provider.refresh = sinon.stub().resolves();

    await provider.handleMessage({ command: 'openLegacyInstructions' });

    expect(executeCommand.calledOnceWith(Commands.OPEN_SONARQUBE_RULES_FILE, false)).to.be.true;
    expect(provider.refresh.calledOnce).to.be.true;
  });
});
