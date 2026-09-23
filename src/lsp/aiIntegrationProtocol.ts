/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as lsp from 'vscode-languageserver-protocol';

export namespace AiIntegration {
  // LSP4J serializes Java response enums as ordinals. Keep these values aligned with SLCORE.
  export enum AiAgent {
    CURSOR = 0,
    GITHUB_COPILOT = 1,
    KIRO = 2,
    WINDSURF = 3,
    CLAUDE_CODE = 4,
    CODEX = 5,
    GITHUB_COPILOT_CLI = 6,
    ANTIGRAVITY = 7
  }

  export enum AiAgentDetectionSource {
    IDE = 0,
    CLI = 1
  }

  export enum AiIntegrationHost {
    VSCODE = 'VSCODE',
    CURSOR = 'CURSOR',
    WINDSURF = 'WINDSURF',
    KIRO = 'KIRO',
    INTELLIJ = 'INTELLIJ',
    VISUAL_STUDIO = 'VISUAL_STUDIO',
    OTHER = 'OTHER'
  }

  export enum AiIntegrationScope {
    GLOBAL = 'GLOBAL',
    PROJECT = 'PROJECT'
  }

  export enum CliInstallationStatus {
    NOT_INSTALLED = 0,
    INSTALLED = 1,
    UNUSABLE = 2
  }

  export enum CliAuthenticationStatus {
    AUTHENTICATED = 0,
    UNAUTHENTICATED = 1,
    INVALID = 2,
    UNVERIFIED = 3,
    UNAVAILABLE = 4,
    UNKNOWN = 5
  }

  export enum McpConfigurationState {
    NOT_CONFIGURED = 0,
    STANDALONE = 1,
    CLI_MANAGED = 2,
    UNKNOWN = 3,
    MALFORMED = 4
  }

  export interface GetAiIntegrationStateParams {
    ideHost: AiIntegrationHost;
    detectedAgents: AiAgent[];
    scope: AiIntegrationScope;
    configurationScopeId?: string | null;
    discoverLocalAgentClis?: boolean;
  }

  export interface SonarQubeCliState {
    installationStatus: CliInstallationStatus;
    authenticationStatus: CliAuthenticationStatus;
    executablePath?: string | null;
    version?: string | null;
    serverUrl?: string | null;
    organization?: string | null;
  }

  export interface AiIntegrationAgentCapability {
    agent: AiAgent;
    detectionSources: AiAgentDetectionSource[];
    cliIntegrationSupported: boolean;
    standaloneMcpSupported: boolean;
    hookSupported: boolean;
    skillSupported: boolean;
  }

  export interface AiIntegrationConnection {
    connectionId: string;
    serverUrl: string;
    organization?: string | null;
  }

  export interface GetAiIntegrationStateResponse {
    cli: SonarQubeCliState;
    agents: AiIntegrationAgentCapability[];
    connectionChoices: AiIntegrationConnection[];
    recommendedConnectionId?: string | null;
  }

  export namespace GetAiIntegrationState {
    export const type = new lsp.RequestType<GetAiIntegrationStateParams, GetAiIntegrationStateResponse, null>(
      'sonarlint/getAiIntegrationState'
    );
  }

  export interface PrepareAuthenticateCliCommandParams {
    serverUrl?: string | null;
    organization?: string | null;
    connectionId?: string | null;
  }

  export interface PrepareIntegrateCliCommandParams {
    agent?: AiAgent | null;
  }

  export interface PrepareCliCommandResponse {
    executable: string;
    arguments: string[];
    interactive: boolean;
  }

  export namespace PrepareInstallCliCommand {
    export const type = new lsp.RequestType0<PrepareCliCommandResponse, null>('sonarlint/prepareInstallCliCommand');
  }

  export namespace PrepareAuthenticateCliCommand {
    export const type = new lsp.RequestType<PrepareAuthenticateCliCommandParams, PrepareCliCommandResponse, null>(
      'sonarlint/prepareAuthenticateCliCommand'
    );
  }

  export namespace PrepareIntegrateCliCommand {
    export const type = new lsp.RequestType<PrepareIntegrateCliCommandParams, PrepareCliCommandResponse, null>(
      'sonarlint/prepareIntegrateCliCommand'
    );
  }

  export interface McpConfigurationInspectionParams {
    agent: AiAgent;
    content?: string | null;
  }

  export interface McpConfigurationInspectionResponse {
    state: McpConfigurationState;
    diagnostics: string[];
  }

  export namespace InspectMcpConfiguration {
    export const type = new lsp.RequestType<McpConfigurationInspectionParams, McpConfigurationInspectionResponse, null>(
      'sonarlint/inspectMcpConfiguration'
    );
  }

  export interface McpConfigurationUpdateParams {
    agent: AiAgent;
    content?: string | null;
    sonarMcpConfiguration: string;
  }

  export interface McpConfigurationUpdatePlanResponse {
    state: McpConfigurationState;
    updatedContent?: string | null;
    diagnostics: string[];
  }

  export namespace PlanMcpConfigurationUpdate {
    export const type = new lsp.RequestType<McpConfigurationUpdateParams, McpConfigurationUpdatePlanResponse, null>(
      'sonarlint/planMcpConfigurationUpdate'
    );
  }
}
