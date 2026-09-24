/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import { AiIntegration } from '../lsp/aiIntegrationProtocol';

export const IntegrationTarget = {
  GITHUB_COPILOT: AiIntegration.AiAgent.GITHUB_COPILOT,
  CURSOR: AiIntegration.AiAgent.CURSOR,
  WINDSURF: AiIntegration.AiAgent.WINDSURF,
  KIRO: AiIntegration.AiAgent.KIRO
} as const;

export type IntegrationTarget = (typeof IntegrationTarget)[keyof typeof IntegrationTarget];

const AGENT_DISPLAY_NAMES: Record<AiIntegration.AiAgent, string> = {
  [IntegrationTarget.GITHUB_COPILOT]: 'Copilot in VS Code',
  [IntegrationTarget.CURSOR]: 'Cursor',
  [IntegrationTarget.WINDSURF]: 'Windsurf',
  [IntegrationTarget.KIRO]: 'Kiro',
  [AiIntegration.AiAgent.CLAUDE_CODE]: 'Claude Code',
  [AiIntegration.AiAgent.CODEX]: 'Codex',
  [AiIntegration.AiAgent.GITHUB_COPILOT_CLI]: 'GitHub Copilot CLI',
  [AiIntegration.AiAgent.ANTIGRAVITY]: 'Antigravity'
};

export const IdeHost = {
  VSCODE: AiIntegration.AiIntegrationHost.VSCODE,
  CURSOR: AiIntegration.AiIntegrationHost.CURSOR,
  WINDSURF: AiIntegration.AiIntegrationHost.WINDSURF,
  KIRO: AiIntegration.AiIntegrationHost.KIRO,
  OTHER: AiIntegration.AiIntegrationHost.OTHER
} as const;

export type IdeHost = (typeof IdeHost)[keyof typeof IdeHost];

export type DetectedAgentId =
  | IntegrationTarget
  | typeof AiIntegration.AiAgent.CLAUDE_CODE
  | typeof AiIntegration.AiAgent.CODEX;

export interface DetectedIdeAgent {
  id: DetectedAgentId;
  name: string;
  source: 'builtIn' | 'extension';
}

export interface CurrentIdeHost {
  id: IdeHost;
  name: string;
}

export function toAgentKey(agent: AiIntegration.AiAgent): string {
  return AiIntegration.AiAgent[agent].toLowerCase();
}

export function toAgentDisplayName(agent: AiIntegration.AiAgent): string {
  return AGENT_DISPLAY_NAMES[agent] ?? 'AI agent';
}

export interface DetectedIntegrationAgent extends AiIntegration.AiIntegrationAgentCapability {
  name: string;
}

export function getDetectedIntegrationAgents(
  state: AiIntegration.GetAiIntegrationStateResponse
): DetectedIntegrationAgent[] {
  const ideAgents = getDetectedIdeAgents();
  const ideOrder = new Map<AiIntegration.AiAgent, number>(ideAgents.map((agent, index) => [agent.id, index]));
  const ideNames = new Map<AiIntegration.AiAgent, string>(ideAgents.map(agent => [agent.id, agent.name]));
  return state.agents
    .filter(agent => agent.detectionSources.length > 0)
    .map(agent => ({ ...agent, name: ideNames.get(agent.agent) ?? toAgentDisplayName(agent.agent) }))
    .sort((a, b) => (ideOrder.get(a.agent) ?? Infinity) - (ideOrder.get(b.agent) ?? Infinity));
}

const COPILOT_CHAT_EXTENSION_ID = 'github.copilot-chat';
export const COPILOT_ACTIVATION_DELAY_MS = 10000;

interface BuiltInAgent {
  id: IntegrationTarget;
  name: string;
  hookSupported: boolean;
}

interface IdeHostDefinition {
  id: Exclude<IdeHost, typeof IdeHost.OTHER>;
  name: string;
  appNameMatch: string;
  builtInAgent?: BuiltInAgent;
}

const IDE_HOSTS: readonly IdeHostDefinition[] = [
  {
    id: IdeHost.CURSOR,
    name: 'Cursor',
    appNameMatch: 'cursor',
    builtInAgent: { id: IntegrationTarget.CURSOR, name: 'Cursor', hookSupported: false }
  },
  {
    id: IdeHost.WINDSURF,
    name: 'Windsurf',
    appNameMatch: 'windsurf',
    builtInAgent: { id: IntegrationTarget.WINDSURF, name: 'Windsurf', hookSupported: true }
  },
  {
    id: IdeHost.KIRO,
    name: 'Kiro',
    appNameMatch: 'kiro',
    builtInAgent: { id: IntegrationTarget.KIRO, name: 'Kiro', hookSupported: false }
  },
  {
    id: IdeHost.VSCODE,
    name: 'VS Code',
    appNameMatch: 'visual studio code'
  }
];

const EXTENSION_AGENTS = [
  {
    id: AiIntegration.AiAgent.CLAUDE_CODE,
    name: 'Claude Code',
    extensionId: 'anthropic.claude-code'
  },
  {
    id: AiIntegration.AiAgent.CODEX,
    name: 'Codex',
    extensionId: 'openai.chatgpt'
  }
] as const;

function isExtensionInstalled(extensionId: string): boolean {
  return vscode.extensions.getExtension(extensionId) !== undefined;
}

function isCopilotInstalledAndActive(): boolean {
  return vscode.extensions.getExtension(COPILOT_CHAT_EXTENSION_ID)?.isActive === true;
}

export function isAgentActiveForMcp(agent: AiIntegration.AiAgent): boolean {
  if (agent === AiIntegration.AiAgent.GITHUB_COPILOT) {
    return isCopilotInstalledAndActive();
  }
  return true;
}

function findMatchingHost(appName: string): IdeHostDefinition | undefined {
  return IDE_HOSTS.find(host => appName.includes(host.appNameMatch));
}

export function getCurrentIdeHost(): CurrentIdeHost {
  const host = findMatchingHost(vscode.env.appName.toLowerCase());
  if (host) {
    return { id: host.id, name: host.name };
  }
  return { id: IdeHost.OTHER, name: vscode.env.appName };
}

/**
 * Returns agents available in the IDE hosting this extension. Built-in agents
 * from another IDE are never inferred from machine-level files.
 *
 * Copilot is reported when the extension is installed, even if it is not yet
 * activated. MCP configuration still requires Copilot to be active — see
 * getCurrentAgentWithMCPSupport.
 */
export function getDetectedIdeAgents(): DetectedIdeAgent[] {
  const host = findMatchingHost(vscode.env.appName.toLowerCase());
  const agents: DetectedIdeAgent[] = [];

  if (host?.builtInAgent) {
    agents.push({
      id: host.builtInAgent.id,
      name: host.builtInAgent.name,
      source: 'builtIn'
    });
  } else if (host?.id === IdeHost.VSCODE && isExtensionInstalled(COPILOT_CHAT_EXTENSION_ID)) {
    agents.push({
      id: IntegrationTarget.GITHUB_COPILOT,
      name: 'Copilot in VS Code',
      source: 'extension'
    });
  }

  for (const agent of EXTENSION_AGENTS) {
    if (isExtensionInstalled(agent.extensionId)) {
      agents.push({
        id: agent.id,
        name: agent.name,
        source: 'extension'
      });
    }
  }

  return agents;
}

export function getCurrentAgentWithMCPSupport(): IntegrationTarget | undefined {
  const host = findMatchingHost(vscode.env.appName.toLowerCase());
  if (host?.builtInAgent) {
    return host.builtInAgent.id;
  }
  if (host?.id === IdeHost.VSCODE && isCopilotInstalledAndActive()) {
    return IntegrationTarget.GITHUB_COPILOT;
  }
  return undefined;
}

export function getCurrentAgentWithHookSupport(): IntegrationTarget | undefined {
  const host = findMatchingHost(vscode.env.appName.toLowerCase());
  return host?.builtInAgent?.hookSupported ? host.builtInAgent.id : undefined;
}

export function getAiIntegrationStateParams(
  scope: AiIntegration.AiIntegrationScope,
  configurationScopeId?: string | null
): AiIntegration.GetAiIntegrationStateParams {
  return {
    ideHost: getCurrentIdeHost().id,
    detectedAgents: getDetectedIdeAgents().map(agent => agent.id),
    scope,
    configurationScopeId,
    discoverLocalAgentClis: true
  };
}

export function getWindsurfDirectory(): string {
  const appName = vscode.env.appName.toLowerCase();
  if (appName.includes('next')) {
    return 'windsurf-next';
  }
  return 'windsurf';
}
