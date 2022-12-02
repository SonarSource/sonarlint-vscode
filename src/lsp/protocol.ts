/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as lsp from 'vscode-languageserver-protocol';

//#region Client side extensions to LSP

export namespace ShowRuleDescriptionNotification {
  export const type = new lsp.NotificationType<ShowRuleDescriptionParams>('sonarlint/showRuleDescription');
}

export namespace ShowHotspotRuleDescriptionNotification {
  export const type = new lsp.NotificationType<ShowHotspotRuleDescriptionNotificationParams>(
    'sonarlint/showHotspotRuleDescription'
  );
}

export interface ShowHotspotRuleDescriptionNotificationParams {
  ruleKey: string;
  fileUri: string;
}

export interface ShowRuleDescriptionParams {
  key: string;
  name: string;
  htmlDescription: string;
  type: string;
  severity: string;
  isTaint: boolean;
  parameters?: Array<{
    name: string;
    description: string;
    defaultValue: string;
  }>;
}

export namespace GetJavaConfigRequest {
  export const type = new lsp.RequestType<string, GetJavaConfigResponse, void>('sonarlint/getJavaConfig');
}

export namespace ScmCheckRequest {
  export const type = new lsp.RequestType<string, boolean, void>('sonarlint/isIgnoredByScm');
}

export namespace ShowNotificationForFirstSecretsIssueNotification {
  export const type = new lsp.NotificationType('sonarlint/showNotificationForFirstSecretsIssue');
}

export interface GetJavaConfigResponse {
  projectRoot: string;
  sourceLevel: string;
  classpath: string[];
  isTest: boolean;
  vmLocation: string;
}

export namespace ShowSonarLintOutputNotification {
  export const type = new lsp.NotificationType('sonarlint/showSonarLintOutput');
}

export namespace OpenJavaHomeSettingsNotification {
  export const type = new lsp.NotificationType('sonarlint/openJavaHomeSettings');
}

export namespace OpenPathToNodeSettingsNotification {
  export const type = new lsp.NotificationType('sonarlint/openPathToNodeSettings');
}

export namespace BrowseToNotification {
  export const type = new lsp.NotificationType<string>('sonarlint/browseTo');
}

export namespace OpenConnectionSettingsNotification {
  export const type = new lsp.NotificationType<boolean>('sonarlint/openConnectionSettings');
}

export enum HotspotResolution {
  Fixed,
  Safe
}

export enum HotspotProbability {
  High,
  Medium,
  Low
}

export enum HotspotStatus {
  ToReview,
  Reviewed
}

export interface RemoteHotspot {
  message: string;
  filePath: string;
  textRange: TextRange;
  author: string;
  status: HotspotStatus;
  resolution?: HotspotResolution;
  rule: {
    key: string;
    name: string;
    securityCategory: string;
    vulnerabilityProbability: HotspotProbability;
    riskDescription: string;
    vulnerabilityDescription: string;
    fixRecommendations: string;
  };
}

export namespace ShowHotspotNotification {
  export const type = new lsp.NotificationType<RemoteHotspot>('sonarlint/showHotspot');
}

export namespace SubmitTokenNotification {
  export const type = new lsp.NotificationType<string>('sonarlint/submitToken');
}

export interface TextRange {
  startLine: number;
  endLine?: number;
  startLineOffset?: number;
  endLineOffset?: number;
}

export interface Location {
  uri?: string;
  filePath: string;
  textRange: TextRange;
  message?: string;
  exists: boolean;
  codeMatches: boolean;
}

export interface Flow {
  locations: Location[];
}

export interface Issue {
  fileUri: string;
  message: string;
  severity: string;
  ruleKey: string;
  connectionId?: string;
  creationDate?: string;
  flows: Flow[];
  textRange: TextRange;
}

export namespace ShowIssueOrHotspotNotification {
  export const type = new lsp.NotificationType<Issue>('sonarlint/showIssueOrHotspot');
}

export namespace GetBranchNameForFolderRequest {
  export const type = new lsp.RequestType<string, string, void>('sonarlint/getBranchNameForFolder');
}

export interface BranchNameForFolder {
  folderUri: string;
  branchName?: string;
}

export namespace SetReferenceBranchNameForFolderNotification {
  export const type = new lsp.NotificationType<BranchNameForFolder>('sonarlint/setReferenceBranchNameForFolder');
}

export namespace NeedCompilationDatabaseRequest {
  export const type = new lsp.NotificationType('sonarlint/needCompilationDatabase');
}

export namespace EditorOpenCheck {
  export const type = new lsp.RequestType<string, boolean, void>('sonarlint/isOpenInEditor');
}

export interface ConnectionCheckResult {
  connectionId: string;
  success: boolean;
  reason?: string;
}

export interface ConnectionCheckParams {
  connectionId: string;
}

export namespace ReportConnectionCheckResult {
  export const type = new lsp.NotificationType<ConnectionCheckResult>('sonarlint/reportConnectionCheckResult');
}

export namespace CheckConnection {
  export const type = new lsp.RequestType<ConnectionCheckParams, ConnectionCheckResult, void>(
    'sonarlint/checkConnection'
  );
}

//#endregion

//#region Server side extensions to LSP

export interface DidClasspathUpdateParams {
  projectUri: string;
}

export namespace DidClasspathUpdateNotification {
  export const type = new lsp.NotificationType<DidClasspathUpdateParams>('sonarlint/didClasspathUpdate');
}

export interface DidJavaServerModeChangeParams {
  serverMode: string;
}

export namespace DidJavaServerModeChangeNotification {
  export const type = new lsp.NotificationType<DidJavaServerModeChangeParams>('sonarlint/didJavaServerModeChange');
}

export interface DidLocalBranchNameChangeParams {
  folderUri: string;
  branchName?: string;
}

export namespace DidLocalBranchNameChangeNotification {
  export const type = new lsp.NotificationType<DidLocalBranchNameChangeParams>('sonarlint/didLocalBranchNameChange');
}

export type ConfigLevel = 'on' | 'off';

export interface Rule {
  readonly key: string;
  readonly name: string;
  readonly activeByDefault: boolean;
  levelFromConfig?: ConfigLevel;
}

export interface RulesResponse {
  [language: string]: Array<Rule>;
}

export namespace ListAllRulesRequest {
  export const type = new lsp.RequestType0<RulesResponse, void>('sonarlint/listAllRules');
}

export namespace GetTokenForServer {
  export const type = new lsp.RequestType<string, string, void>('sonarlint/getTokenForServer');
}

export namespace OnTokenUpdate {
  export const type = new lsp.NotificationType<void>('sonarlint/onTokenUpdate');
}

export interface GetRemoteProjectsForConnectionParams {
  connectionId: string;
}

export interface RemoteProject {
  [projectKey: string]: string;
}

export namespace GetRemoteProjectsForConnection {
  export const type = new lsp.RequestType<GetRemoteProjectsForConnectionParams, Map<string, string>, void>(
    'sonarlint/getRemoteProjectsForConnection'
  );
}

interface GetRemoteProjectNamesParams {
  connectionId?: string;
  projectKeys: Array<string>;
}

export namespace GetRemoteProjectNames {
  export const type = new lsp.RequestType<GetRemoteProjectNamesParams, { [key: string]: string }, null>(
    'sonarlint/getRemoteProjectNames'
  );
}

export interface ServerPathParams {
  baseServerUrl: string;
}

export interface ServerPathResponse {
  serverUrl?: string;
  errorMessage?: string;
}

export namespace GetServerPathForTokenGeneration {
  export const type = new lsp.RequestType<ServerPathParams, ServerPathResponse, null>(
    'sonarlint/getServerPathForTokenGeneration'
  );
}

export interface Range {
  line: number;
  character: number;
}

export interface DiagnosticRange {
  start: Range;
  end: Range;
}

export interface Diagnostic extends lsp.Diagnostic {
  creationDate?: string;
  flows: Flow[];
}

export interface PublishHotspotsForFileParams {
  uri: string;
  diagnostics: Diagnostic[];
}

export namespace PublishHotspotsForFile {
  export const type = new lsp.NotificationType<PublishHotspotsForFileParams>('sonarlint/publishSecurityHotspots');
}

export interface ShowHotspotLocationsParams {
  hotspotKey: string;
  fileUri: string;
}

export namespace ShowHotspotLocations {
  export const type = new lsp.RequestType<ShowHotspotLocationsParams, null, null>('sonarlint/showHotspotLocations');
}

export interface OpenHotspotParams {
  hotspotId: string;
  fileUri: string;
}

export namespace OpenHotspotOnServer {
  export const type = new lsp.NotificationType<OpenHotspotParams>('sonarlint/openHotspotInBrowser');
}

//#endregion
