/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { SonarLintExtendedLanguageClient } from '../lsp/client';
import { ExtendedServer } from '../lsp/protocol';
import { IDE_HOST, INTEGRATION_TARGET } from './aiAgentUtils';

const HOST_BY_ID: Record<IDE_HOST, ExtendedServer.AiIntegrationHost> = {
  [IDE_HOST.VS_CODE]: ExtendedServer.AiIntegrationHost.VSCODE,
  [IDE_HOST.CURSOR]: ExtendedServer.AiIntegrationHost.CURSOR,
  [IDE_HOST.WINDSURF]: ExtendedServer.AiIntegrationHost.WINDSURF,
  [IDE_HOST.KIRO]: ExtendedServer.AiIntegrationHost.KIRO,
  [IDE_HOST.OTHER]: ExtendedServer.AiIntegrationHost.OTHER
};

const AGENT_BY_ID: Record<INTEGRATION_TARGET, ExtendedServer.AiAgent> = {
  [INTEGRATION_TARGET.GITHUB_COPILOT]: ExtendedServer.AiAgent.GITHUB_COPILOT,
  [INTEGRATION_TARGET.CURSOR]: ExtendedServer.AiAgent.CURSOR,
  [INTEGRATION_TARGET.WINDSURF]: ExtendedServer.AiAgent.WINDSURF,
  [INTEGRATION_TARGET.KIRO]: ExtendedServer.AiAgent.KIRO,
  [INTEGRATION_TARGET.CLAUDE_CODE]: ExtendedServer.AiAgent.CLAUDE_CODE,
  [INTEGRATION_TARGET.CODEX]: ExtendedServer.AiAgent.CODEX
};

export function toProtocolAgent(agent: INTEGRATION_TARGET): ExtendedServer.AiAgent {
  return AGENT_BY_ID[agent];
}

export class AiIntegrationService {
  constructor(private readonly client: SonarLintExtendedLanguageClient) {}

  getIntegrationState(
    ideHost: IDE_HOST,
    detectedAgents: INTEGRATION_TARGET[],
    scope: ExtendedServer.AiIntegrationScope,
    configurationScopeId?: string | null
  ): Promise<ExtendedServer.GetAiIntegrationStateResponse> {
    return this.client.getAiIntegrationState({
      ideHost: HOST_BY_ID[ideHost],
      detectedAgents: detectedAgents.map(toProtocolAgent),
      scope,
      configurationScopeId
    });
  }

  prepareCliCommand(params: ExtendedServer.PrepareCliCommandParams): Promise<ExtendedServer.PrepareCliCommandResponse> {
    return this.client.prepareCliCommand(params);
  }

  inspectMcpConfiguration(
    params: ExtendedServer.McpConfigurationInspectionParams
  ): Promise<ExtendedServer.McpConfigurationInspectionResponse> {
    return this.client.inspectMcpConfiguration(params);
  }

  planMcpConfigurationUpdate(
    params: ExtendedServer.McpConfigurationUpdateParams
  ): Promise<ExtendedServer.McpConfigurationUpdatePlanResponse> {
    return this.client.planMcpConfigurationUpdate(params);
  }
}
