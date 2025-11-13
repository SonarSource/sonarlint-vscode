/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
import * as VSCode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { ServerMode } from '../java/java';
import { code2ProtocolConverter } from '../util/uri';
import { ExtendedServer, AnalysisFile, ShowRuleDescriptionParams } from './protocol';
import { SonarCloudRegion } from '../settings/connectionsettings';

export class SonarLintExtendedLanguageClient extends LanguageClient {

  listAllRules(): Thenable<ExtendedServer.RulesResponse> {
    return this.sendRequest(ExtendedServer.ListAllRulesRequest.type);
  }

  didClasspathUpdate(projectRoot: VSCode.Uri): void {
    const projectUri = code2ProtocolConverter(projectRoot);
    this.sendNotification(ExtendedServer.DidClasspathUpdateNotification.type, { projectUri });
  }

  didJavaServerModeChange(serverMode: ServerMode) {
    this.sendNotification(ExtendedServer.DidJavaServerModeChangeNotification.type, { serverMode });
  }

  didLocalBranchNameChange(folderRoot: VSCode.Uri, branchName?: string) {
    const folderUri = code2ProtocolConverter(folderRoot);
    this.sendNotification(ExtendedServer.DidLocalBranchNameChangeNotification.type, { folderUri, branchName });
  }

  checkConnection(connectionId: string) {
    return this.sendRequest(ExtendedServer.CheckConnection.type, { connectionId });
  }

  checkNewConnection(token: string, serverOrOrganization: string, isSonarQube: boolean, region?: SonarCloudRegion) {
    const params = isSonarQube
      ? { token, serverUrl: serverOrOrganization }
      : { token, organization: serverOrOrganization, region };
    return this.sendRequest(ExtendedServer.CheckConnection.type, params);
  }

  getRemoteProjectNamesByKeys(connectionId: string, projectKeys: Array<string>) {
    return this.sendRequest(ExtendedServer.GetRemoteProjectNamesByProjectKeys.type, { connectionId, projectKeys });
  }

  onTokenUpdate(connectionId: string, token: string) {
    return this.sendNotification(ExtendedServer.OnTokenUpdate.type, { connectionId, token });
  }

  getRemoteProjectsForConnection(connectionId: string) {
    return this.sendRequest(ExtendedServer.GetRemoteProjectsForConnection.type, { connectionId });
  }

  generateToken(baseServerUrl: string): Promise<ExtendedServer.GenerateTokenResponse> {
    return this.sendRequest(ExtendedServer.GenerateToken.type, { baseServerUrl });
  }

  showHotspotLocations(hotspotKey: string, fileUri: string): void {
    this.sendRequest(ExtendedServer.ShowHotspotLocations.type, { hotspotKey, fileUri });
  }

  showHotspotRuleDescription(hotspotId: string, fileUri: string) {
    this.sendNotification(ExtendedServer.ShowHotspotRuleDescriptionNotification.type, { hotspotId, fileUri });
  }

  openHotspotOnServer(hotspotId: string, fileUri: string) {
    this.sendNotification(ExtendedServer.OpenHotspotOnServer.type, { hotspotId, fileUri });
  }

  openDependencyRiskInBrowser(folderUri: string, issueId: string) {
    this.sendNotification(ExtendedServer.OpenDependencyRiskInBrowser.type, { folderUri, issueId });
  }

  dependencyRiskInvestigatedLocally() {
    this.sendNotification(ExtendedServer.DependencyRiskInvestigatedLocally.type);
  }
  

  getDependencyRiskTransitions(dependencyRiskId: string): Promise<ExtendedServer.GetDependencyRiskTransitionsResponse> {
    return this.sendRequest(ExtendedServer.GetDependencyRiskTransitions.type, { dependencyRiskId });
  }

  helpAndFeedbackLinkClicked(itemId: string) {
    this.sendNotification(ExtendedServer.HelpAndFeedbackLinkClicked.type, { id: itemId });
  }

  lmToolCalled(toolName: string, success: boolean) {
    this.sendNotification(ExtendedServer.LMToolCalled.type, { toolName, success });
  }

  scanFolderForHotspots(params: ExtendedServer.ScanFolderForHotspotsParams) {
    this.sendNotification(ExtendedServer.ScanFolderForHotspots.type, params);
  }

  forgetFolderHotspots() {
    this.sendNotification(ExtendedServer.ForgetFolderHotspots.type);
  }

  getFilePatternsForAnalysis(folderUri: string): Promise<ExtendedServer.GetFilePatternsForAnalysisResponse> {
    return this.sendRequest(ExtendedServer.GetFilePatternsForAnalysis.type, { uri: folderUri });
  }

  getAllowedHotspotStatuses(
    hotspotKey: string,
    folderUri: string,
    fileUri: string
  ): Promise<ExtendedServer.GetAllowedHotspotStatusesResponse> {
    return this.sendRequest(ExtendedServer.GetAllowedHotspotStatuses.type, { hotspotKey, folderUri, fileUri });
  }

  getSuggestedBinding(configScopeId: string, connectionId: string): Promise<ExtendedServer.GetSuggestedBindingResponse> {
    return this.sendRequest(ExtendedServer.GetSuggestedBinding.type, { configScopeId, connectionId });
  }

  getConnectionSuggestions(configurationScopeId: string): Promise<ExtendedServer.GetConnectionSuggestionsResponse> {
    return this.sendRequest(ExtendedServer.GetSuggestedConnections.type, { configurationScopeId })
  }

  getSharedConnectedModeConfigFileContent(
    configScopeId: string
  ): Promise<ExtendedServer.GetSharedConnectedModeConfigFileResponse> {
    return this.sendRequest(ExtendedServer.GetSharedConnectedModeConfigFileContents.type, { configScopeId });
  }

  getMCPServerConfiguration(connectionId: string, token: string): Promise<ExtendedServer.GetMCPServerConfigurationResponse> {
    return this.sendRequest(ExtendedServer.GetMCPServerConfiguration.type, { connectionId, token });
  }

  getMCPRulesFileContent(aiAssistedIde: string): Promise<ExtendedServer.GetMCPRulesFileContentResponse> {
    return this.sendRequest(ExtendedServer.GetMCPRulesFileContent.type, aiAssistedIde);
  }

  checkIssueStatusChangePermitted(
    folderUri: string,
    issueKey: string
  ): Promise<ExtendedServer.CheckIssueStatusChangePermittedResponse> {
    return this.sendRequest(ExtendedServer.CheckIssueStatusChangePermitted.type, { folderUri, issueKey });
  }

  changeIssueStatus(
    configurationScopeId: string,
    issueId: string,
    newStatus: string,
    fileUri: string,
    comment: string,
    isTaintIssue: boolean
  ): Promise<void> {
    return this.sendNotification(ExtendedServer.SetIssueStatus.type, {
      configurationScopeId,
      issueId,
      newStatus,
      fileUri,
      comment,
      isTaintIssue
    });
  }

  changeDependencyRiskStatus(
    configurationScopeId: string,
    dependencyRiskKey: string,
    transition: string,
    comment: string
  ): Promise<void> {
    return this.sendNotification(ExtendedServer.ChangeDependencyRiskStatus.type, { configurationScopeId, dependencyRiskKey, transition, comment });
  }

  reopenResolvedLocalIssues(configurationScopeId: string, relativePath: string, fileUri: string): Promise<void> {
    return this.sendNotification(ExtendedServer.ReopenResolvedLocalIssues.type, {
      configurationScopeId,
      relativePath,
      fileUri
    });
  }

  analyseOpenFileIgnoringExcludes(
    triggeredByUser: boolean,
    textDocument?: AnalysisFile,
    notebookDocument?: VSCode.NotebookDocument,
    notebookCells?: AnalysisFile[]
  ): Promise<void> {
    return this.sendNotification(ExtendedServer.AnalyseOpenFileIgnoringExcludes.type, {
      triggeredByUser,
      textDocument,
      notebookUri: notebookDocument ? notebookDocument.uri.toString() : null,
      notebookVersion: notebookDocument ? notebookDocument.version : null,
      notebookCells
    });
  }

  changeHotspotStatus(hotspotKey: string, newStatus: string, fileUri: string): Promise<void> {
    return this.sendNotification(ExtendedServer.SetHotspotStatus.type, { hotspotKey, newStatus, fileUri });
  }

  checkLocalHotspotsDetectionSupported(folderUri: string): Promise<ExtendedServer.CheckLocalDetectionSupportedResponse> {
    return this.sendRequest(ExtendedServer.CheckLocalDetectionSupported.type, { uri: folderUri });
  }

  getHotspotDetails(hotspotId, fileUri): Promise<ShowRuleDescriptionParams> {
    return this.sendRequest(ExtendedServer.GetHotspotDetails.type, { hotspotId, fileUri });
  }

  didCreateBinding(mode: ExtendedServer.BindingCreationMode): Promise<void> {
    return this.sendNotification(ExtendedServer.DidCreateBinding.type, mode);
  }

  listUserOrganizations(token: string, region: string) : Promise<ExtendedServer.Organization[]> {
    return this.sendRequest(ExtendedServer.ListUserOrganizations.type, { token, region })
  }

  fixSuggestionResolved(suggestionId: string, accepted: boolean): Promise<void> {
    return this.sendNotification(ExtendedServer.FixSuggestionResolved.type, { suggestionId, accepted });
  }

  findingsFiltered(filterType: string): Promise<void> {
    return this.sendNotification(ExtendedServer.FindingsFilteredNotification.type, { filterType });
  }

  dumpThreads(): Promise<void> {
    return this.sendNotification(ExtendedServer.DumpThreadsNotification.type);
  }
}
