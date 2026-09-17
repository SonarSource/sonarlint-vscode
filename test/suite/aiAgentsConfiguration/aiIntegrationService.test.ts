/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { expect } from 'chai';
import * as sinon from 'sinon';
import { AiIntegrationService } from '../../../src/aiAgentsConfiguration/aiIntegrationService';
import { IDE_HOST, INTEGRATION_TARGET } from '../../../src/aiAgentsConfiguration/aiAgentUtils';
import { SonarLintExtendedLanguageClient } from '../../../src/lsp/client';
import { ExtendedServer } from '../../../src/lsp/protocol';

suite('AiIntegrationService', () => {
  let client: SonarLintExtendedLanguageClient;
  let service: AiIntegrationService;
  let getAiIntegrationState: sinon.SinonStub;
  let prepareCliCommand: sinon.SinonStub;
  let inspectMcpConfiguration: sinon.SinonStub;
  let planMcpConfigurationUpdate: sinon.SinonStub;

  setup(() => {
    getAiIntegrationState = sinon.stub().resolves({
      cli: {
        installationStatus: ExtendedServer.CliInstallationStatus.NOT_INSTALLED,
        authenticationStatus: ExtendedServer.CliAuthenticationStatus.UNKNOWN
      },
      agents: [],
      connectionChoices: []
    });
    prepareCliCommand = sinon.stub().resolves({ executable: 'sonar', arguments: [], interactive: true });
    inspectMcpConfiguration = sinon
      .stub()
      .resolves({ state: ExtendedServer.McpConfigurationState.NOT_CONFIGURED, diagnostics: [] });
    planMcpConfigurationUpdate = sinon
      .stub()
      .resolves({ state: ExtendedServer.McpConfigurationState.STANDALONE, diagnostics: [] });
    client = {
      getAiIntegrationState,
      prepareCliCommand,
      inspectMcpConfiguration,
      planMcpConfigurationUpdate
    } as unknown as SonarLintExtendedLanguageClient;
    service = new AiIntegrationService(client);
  });

  test('maps every local host and agent to the SLLS protocol', async () => {
    const hosts = [
      [IDE_HOST.VS_CODE, ExtendedServer.AiIntegrationHost.VSCODE],
      [IDE_HOST.CURSOR, ExtendedServer.AiIntegrationHost.CURSOR],
      [IDE_HOST.WINDSURF, ExtendedServer.AiIntegrationHost.WINDSURF],
      [IDE_HOST.KIRO, ExtendedServer.AiIntegrationHost.KIRO],
      [IDE_HOST.OTHER, ExtendedServer.AiIntegrationHost.OTHER]
    ] as const;

    for (const [host, expectedHost] of hosts) {
      await service.getIntegrationState(host, [], ExtendedServer.AiIntegrationScope.GLOBAL);
      expect(getAiIntegrationState.lastCall.args[0].ideHost).to.equal(expectedHost);
    }

    await service.getIntegrationState(
      IDE_HOST.VS_CODE,
      Object.values(INTEGRATION_TARGET),
      ExtendedServer.AiIntegrationScope.PROJECT,
      'scope-id'
    );
    expect(getAiIntegrationState.lastCall.args[0]).to.deep.equal({
      ideHost: ExtendedServer.AiIntegrationHost.VSCODE,
      detectedAgents: [
        ExtendedServer.AiAgent.GITHUB_COPILOT,
        ExtendedServer.AiAgent.CURSOR,
        ExtendedServer.AiAgent.WINDSURF,
        ExtendedServer.AiAgent.KIRO,
        ExtendedServer.AiAgent.CLAUDE_CODE,
        ExtendedServer.AiAgent.CODEX
      ],
      scope: ExtendedServer.AiIntegrationScope.PROJECT,
      configurationScopeId: 'scope-id'
    });
  });

  test('delegates command and MCP requests unchanged', async () => {
    const command = {
      action: ExtendedServer.CliCommandAction.INTEGRATE,
      agent: ExtendedServer.AiAgent.CODEX
    };
    const inspection = { agent: ExtendedServer.AiAgent.CURSOR, content: null };
    const update = {
      agent: ExtendedServer.AiAgent.CURSOR,
      content: '{}',
      sonarMcpConfiguration: '{"command":"docker"}'
    };

    await service.prepareCliCommand(command);
    await service.inspectMcpConfiguration(inspection);
    await service.planMcpConfigurationUpdate(update);

    expect(prepareCliCommand.calledOnceWithExactly(command)).to.be.true;
    expect(inspectMcpConfiguration.calledOnceWithExactly(inspection)).to.be.true;
    expect(planMcpConfigurationUpdate.calledOnceWithExactly(update)).to.be.true;
  });

  test('propagates client failures', async () => {
    const failure = new Error('SLLS request failed');
    prepareCliCommand.rejects(failure);

    let caught: unknown;
    try {
      await service.prepareCliCommand({ action: ExtendedServer.CliCommandAction.INSTALL });
    } catch (error) {
      caught = error;
    }

    expect(caught).to.equal(failure);
  });
});
