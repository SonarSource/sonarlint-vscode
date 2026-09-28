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

export interface AiIntegrationOutcome {
  status: AiIntegration.AiIntegrationActionStatus;
  agent?: AiIntegration.AiAgent;
}

export class AiIntegrationTelemetry {
  constructor(private readonly languageClient: SonarLintExtendedLanguageClient) {}

  action(action: AiIntegration.AiIntegrationAction, outcome: AiIntegrationOutcome): void {
    this.send(() => this.languageClient.aiIntegrationAction({
      action,
      status: outcome.status,
      agent: outcome.agent === undefined ? null : AiIntegration.AiAgent[outcome.agent] as AiIntegration.AiAgentName,
      host: getCurrentIdeHost().id
    }));
  }

  cliState(cli: AiIntegration.SonarQubeCliState): void {
    this.send(() => this.languageClient.aiIntegrationCliStateObserved({
      installationStatus: AiIntegration.CliInstallationStatus[cli.installationStatus] as AiIntegration.CliInstallationStatusName,
      authenticationStatus: AiIntegration.CliAuthenticationStatus[cli.authenticationStatus] as AiIntegration.CliAuthenticationStatusName,
      host: getCurrentIdeHost().id
    }));
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
        .map(source => AiIntegration.AiAgentDetectionSource[source] as AiIntegration.AiAgentDetectionSourceName);
      if (detectionSources.length === 0) {
        continue;
      }
      const standaloneMcpState = inspectedStates.get(agent) ?? AiIntegration.McpConfigurationState.UNKNOWN;
      this.send(() => this.languageClient.aiAgentIntegrationStateObserved({
        agent: AiIntegration.AiAgent[agent] as AiIntegration.AiAgentName,
        detectionSources,
        standaloneMcpState: AiIntegration.McpConfigurationState[standaloneMcpState] as AiIntegration.McpConfigurationStateName,
        host: getCurrentIdeHost().id
      }));
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
