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

  export type AiAgentName = keyof typeof AiAgent;
  export type AiAgentDetectionSourceName = keyof typeof AiAgentDetectionSource;
  export type CliInstallationStatusName = keyof typeof CliInstallationStatus;
  export type CliAuthenticationStatusName = keyof typeof CliAuthenticationStatus;
  export type McpConfigurationStateName = keyof typeof McpConfigurationState;

  // Response enums above stay ordinals. Notifications send these names.
  // Indexing the enum object is a reverse lookup, so it is not used as the name.
  export const AI_AGENT_NAMES: Record<AiAgent, AiAgentName> = {
    [AiAgent.CURSOR]: 'CURSOR',
    [AiAgent.GITHUB_COPILOT]: 'GITHUB_COPILOT',
    [AiAgent.KIRO]: 'KIRO',
    [AiAgent.WINDSURF]: 'WINDSURF',
    [AiAgent.CLAUDE_CODE]: 'CLAUDE_CODE',
    [AiAgent.CODEX]: 'CODEX',
    [AiAgent.GITHUB_COPILOT_CLI]: 'GITHUB_COPILOT_CLI',
    [AiAgent.ANTIGRAVITY]: 'ANTIGRAVITY'
  };

  export const AI_AGENT_DETECTION_SOURCE_NAMES: Record<AiAgentDetectionSource, AiAgentDetectionSourceName> = {
    [AiAgentDetectionSource.IDE]: 'IDE',
    [AiAgentDetectionSource.CLI]: 'CLI'
  };

  export const CLI_INSTALLATION_STATUS_NAMES: Record<CliInstallationStatus, CliInstallationStatusName> = {
    [CliInstallationStatus.NOT_INSTALLED]: 'NOT_INSTALLED',
    [CliInstallationStatus.INSTALLED]: 'INSTALLED',
    [CliInstallationStatus.UNUSABLE]: 'UNUSABLE'
  };

  export const CLI_AUTHENTICATION_STATUS_NAMES: Record<CliAuthenticationStatus, CliAuthenticationStatusName> = {
    [CliAuthenticationStatus.AUTHENTICATED]: 'AUTHENTICATED',
    [CliAuthenticationStatus.UNAUTHENTICATED]: 'UNAUTHENTICATED',
    [CliAuthenticationStatus.INVALID]: 'INVALID',
    [CliAuthenticationStatus.UNVERIFIED]: 'UNVERIFIED',
    [CliAuthenticationStatus.UNAVAILABLE]: 'UNAVAILABLE',
    [CliAuthenticationStatus.UNKNOWN]: 'UNKNOWN'
  };

  export const MCP_CONFIGURATION_STATE_NAMES: Record<McpConfigurationState, McpConfigurationStateName> = {
    [McpConfigurationState.NOT_CONFIGURED]: 'NOT_CONFIGURED',
    [McpConfigurationState.STANDALONE]: 'STANDALONE',
    [McpConfigurationState.CLI_MANAGED]: 'CLI_MANAGED',
    [McpConfigurationState.UNKNOWN]: 'UNKNOWN',
    [McpConfigurationState.MALFORMED]: 'MALFORMED'
  };

  // These notification enums are serialized as names.
  export enum AiIntegrationAction {
    OPEN_CLI_DOCUMENTATION = 'OPEN_CLI_DOCUMENTATION',
    OPEN_VORTEX_DOCUMENTATION = 'OPEN_VORTEX_DOCUMENTATION',
    OPEN_MCP_DOCUMENTATION = 'OPEN_MCP_DOCUMENTATION',
    INSTALL_CLI = 'INSTALL_CLI',
    LOGIN_CLI = 'LOGIN_CLI',
    INTEGRATE_AGENT = 'INTEGRATE_AGENT',
    CONFIGURE_MCP = 'CONFIGURE_MCP',
    OPEN_MCP_CONFIGURATION = 'OPEN_MCP_CONFIGURATION',
    REFRESH = 'REFRESH'
  }

  export enum AiIntegrationActionStatus {
    STARTED = 'STARTED',
    SUCCEEDED = 'SUCCEEDED',
    CANCELLED = 'CANCELLED',
    FAILED = 'FAILED',
    UNKNOWN = 'UNKNOWN'
  }

  // Domain result of an attempted action. Telemetry reports it; it is not a notification payload.
  export interface AiIntegrationOutcome {
    status: AiIntegrationActionStatus;
    agent?: AiAgent;
  }

  export interface AiIntegrationActionParams {
    action: AiIntegrationAction;
    status: AiIntegrationActionStatus;
    agent: AiAgentName | null;
    host: AiIntegrationHost;
  }

  export namespace ReportAiIntegrationAction {
    export const type = new lsp.NotificationType<AiIntegrationActionParams>('sonarlint/aiIntegrationAction');
  }

  export interface AiIntegrationCliStateObservedParams {
    installationStatus: CliInstallationStatusName;
    authenticationStatus: CliAuthenticationStatusName;
    host: AiIntegrationHost;
  }

  export namespace ReportAiIntegrationCliStateObserved {
    export const type = new lsp.NotificationType<AiIntegrationCliStateObservedParams>(
      'sonarlint/aiIntegrationCliStateObserved'
    );
  }

  export interface AiAgentIntegrationStateObservedParams {
    agent: AiAgentName;
    detectionSources: AiAgentDetectionSourceName[];
    standaloneMcpState: McpConfigurationStateName;
    host: AiIntegrationHost;
  }

  export namespace ReportAiAgentIntegrationStateObserved {
    export const type = new lsp.NotificationType<AiAgentIntegrationStateObservedParams>(
      'sonarlint/aiAgentIntegrationStateObserved'
    );
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

  export enum AuthenticateCliWithConnectionStatus {
    AUTHENTICATED = 0,
    INTERACTIVE_LOGIN_REQUIRED = 1,
    UPGRADE_REQUIRED = 2,
    FAILED = 3
  }

  export interface AuthenticateCliWithConnectionParams {
    connectionId: string;
  }

  export interface AuthenticateCliWithConnectionResponse {
    status: AuthenticateCliWithConnectionStatus;
    diagnostic?: string | null;
  }

  export namespace AuthenticateCliWithConnection {
    export const type = new lsp.RequestType<
      AuthenticateCliWithConnectionParams,
      AuthenticateCliWithConnectionResponse,
      null
    >('sonarlint/authenticateCliWithConnection');
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
