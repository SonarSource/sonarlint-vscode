/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { AiIntegration } from '../lsp/aiIntegrationProtocol';
import { SonarLintExtendedLanguageClient } from '../lsp/client';
import { logToSonarLintOutput } from '../util/logging';
import { getCurrentIdeHost } from './aiAgentUtils';

export class AiIntegrationTelemetry {
  constructor(private readonly languageClient: SonarLintExtendedLanguageClient) {}

  action(action: AiIntegration.AiIntegrationAction, outcome: AiIntegration.AiIntegrationOutcome): void {
    this.send(() =>
      this.languageClient.aiIntegrationAction({
        action,
        status: outcome.status,
        agent: outcome.agent === undefined ? null : AiIntegration.AI_AGENT_NAMES[outcome.agent],
        host: getCurrentIdeHost().id
      })
    );
  }

  cliState(cli: AiIntegration.SonarQubeCliState): void {
    this.send(() =>
      this.languageClient.aiIntegrationCliStateObserved({
        installationStatus: AiIntegration.CLI_INSTALLATION_STATUS_NAMES[cli.installationStatus],
        authenticationStatus: AiIntegration.CLI_AUTHENTICATION_STATUS_NAMES[cli.authenticationStatus],
        host: getCurrentIdeHost().id
      })
    );
  }

  agentStates(
    agents: AiIntegration.AiIntegrationAgentCapability[],
    inspectedStates: ReadonlyMap<AiIntegration.AiAgent, AiIntegration.McpConfigurationState>
  ): void {
    const sourcesByAgent = new Map<AiIntegration.AiAgent, Set<AiIntegration.AiAgentDetectionSource>>();
    for (const agent of agents) {
      if (agent.detectionSources.length === 0) {
        continue;
      }
      const sources = sourcesByAgent.get(agent.agent) ?? new Set<AiIntegration.AiAgentDetectionSource>();
      for (const source of agent.detectionSources) {
        sources.add(source);
      }
      sourcesByAgent.set(agent.agent, sources);
    }
    for (const [agent, sources] of sourcesByAgent) {
      const detectionSources = [AiIntegration.AiAgentDetectionSource.IDE, AiIntegration.AiAgentDetectionSource.CLI]
        .filter(source => sources.has(source))
        .map(source => AiIntegration.AI_AGENT_DETECTION_SOURCE_NAMES[source]);
      if (detectionSources.length === 0) {
        continue;
      }
      const standaloneMcpState = inspectedStates.get(agent) ?? AiIntegration.McpConfigurationState.UNKNOWN;
      this.send(() =>
        this.languageClient.aiAgentIntegrationStateObserved({
          agent: AiIntegration.AI_AGENT_NAMES[agent],
          detectionSources,
          standaloneMcpState: AiIntegration.MCP_CONFIGURATION_STATE_NAMES[standaloneMcpState],
          host: getCurrentIdeHost().id
        })
      );
    }
  }

  private send(notification: () => Promise<void>): void {
    void this.deliver(notification);
  }

  private async deliver(notification: () => Promise<void>): Promise<void> {
    try {
      await notification();
    } catch {
      logToSonarLintOutput('Could not report AI integrations telemetry.');
    }
  }
}
