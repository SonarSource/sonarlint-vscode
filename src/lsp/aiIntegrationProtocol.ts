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

  export enum AiIntegrationFailureCategory {
    BACKEND_ERROR = 'BACKEND_ERROR',
    UNSUPPORTED = 'UNSUPPORTED',
    TERMINAL_ERROR = 'TERMINAL_ERROR',
    FILESYSTEM_ERROR = 'FILESYSTEM_ERROR',
    MALFORMED_CONFIGURATION = 'MALFORMED_CONFIGURATION',
    CONNECTION_UNAVAILABLE = 'CONNECTION_UNAVAILABLE',
    UNKNOWN = 'UNKNOWN'
  }

  export enum AiIntegrationObservationTrigger {
    INITIAL_LOAD = 'INITIAL_LOAD',
    MANUAL_REFRESH = 'MANUAL_REFRESH',
    POST_ACTION = 'POST_ACTION'
  }

  export enum AiIntegrationEnvironment {
    LOCAL = 'LOCAL',
    REMOTE = 'REMOTE',
    UNKNOWN = 'UNKNOWN'
  }

  export interface AiIntegrationActionParams {
    action: AiIntegrationAction;
    status: AiIntegrationActionStatus;
    failureCategory: AiIntegrationFailureCategory | null;
    agent: AiAgentName | null;
    scope: AiIntegrationScope | null;
    host: AiIntegrationHost;
    environment: AiIntegrationEnvironment;
  }

  export namespace ReportAiIntegrationAction {
    export const type = new lsp.NotificationType<AiIntegrationActionParams>('sonarlint/aiIntegrationAction');
  }

  export interface AiIntegrationCliStateObservedParams {
    trigger: AiIntegrationObservationTrigger;
    installationStatus: CliInstallationStatusName;
    authenticationStatus: CliAuthenticationStatusName;
    vortexAvailable: boolean;
    host: AiIntegrationHost;
    environment: AiIntegrationEnvironment;
  }

  export namespace ReportAiIntegrationCliStateObserved {
    export const type = new lsp.NotificationType<AiIntegrationCliStateObservedParams>(
      'sonarlint/aiIntegrationCliStateObserved'
    );
  }

  export interface AiAgentIntegrationStateObservedParams {
    trigger: AiIntegrationObservationTrigger;
    agent: AiAgentName;
    detectionSources: AiAgentDetectionSourceName[];
    standaloneMcpState: McpConfigurationStateName;
    host: AiIntegrationHost;
    environment: AiIntegrationEnvironment;
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
    vortexAvailable: boolean;
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
