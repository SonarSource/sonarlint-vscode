/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
import * as VSCode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { ServerMode } from '../java/java';
import { code2ProtocolConverter } from '../util/uri';
import * as protocol from './protocol';
import { AnalysisFile, Organization } from './protocol';
import { SonarCloudRegion } from '../settings/connectionsettings';

export class SonarLintExtendedLanguageClient extends LanguageClient {
  listAllRules(): Thenable<protocol.RulesResponse> {
    return this.sendRequest(protocol.ListAllRulesRequest.type);
  }

  didClasspathUpdate(projectRoot: VSCode.Uri): void {
    const projectUri = code2ProtocolConverter(projectRoot);
    this.sendNotification(protocol.DidClasspathUpdateNotification.type, { projectUri });
  }

  didJavaServerModeChange(serverMode: ServerMode) {
    this.sendNotification(protocol.DidJavaServerModeChangeNotification.type, { serverMode });
  }

  didLocalBranchNameChange(folderRoot: VSCode.Uri, branchName?: string) {
    const folderUri = code2ProtocolConverter(folderRoot);
    this.sendNotification(protocol.DidLocalBranchNameChangeNotification.type, { folderUri, branchName });
  }

  checkConnection(connectionId: string) {
    return this.sendRequest(protocol.CheckConnection.type, { connectionId });
  }

  checkNewConnection(token: string, serverOrOrganization: string, isSonarQube: boolean, region?: SonarCloudRegion) {
    const params = isSonarQube
      ? { token, serverUrl: serverOrOrganization }
      : { token, organization: serverOrOrganization, region };
    return this.sendRequest(protocol.CheckConnection.type, params);
  }

  getRemoteProjectNamesByKeys(connectionId: string, projectKeys: Array<string>) {
    return this.sendRequest(protocol.GetRemoteProjectNamesByProjectKeys.type, { connectionId, projectKeys });
  }

  onTokenUpdate(connectionId: string, token: string) {
    return this.sendNotification(protocol.OnTokenUpdate.type, { connectionId, token });
  }

  getRemoteProjectsForConnection(connectionId: string) {
    return this.sendRequest(protocol.GetRemoteProjectsForConnection.type, { connectionId });
  }

  generateToken(baseServerUrl: string): Promise<protocol.GenerateTokenResponse> {
    return this.sendRequest(protocol.GenerateToken.type, { baseServerUrl });
  }

  showHotspotLocations(hotspotKey: string, fileUri: string): void {
    this.sendRequest(protocol.ShowHotspotLocations.type, { hotspotKey, fileUri });
  }

  showHotspotRuleDescription(hotspotId: string, fileUri: string) {
    this.sendNotification(protocol.ShowHotspotRuleDescriptionNotification.type, { hotspotId, fileUri });
  }

  openHotspotOnServer(hotspotId: string, fileUri: string) {
    this.sendNotification(protocol.OpenHotspotOnServer.type, { hotspotId, fileUri });
  }

  openDependencyRiskInBrowser(folderUri: string, issueId: string) {
    this.sendNotification(protocol.OpenDependencyRiskInBrowser.type, { folderUri, issueId });
  }

  dependencyRiskInvestigatedLocally() {
    this.sendNotification(protocol.DependencyRiskInvestigatedLocally.type);
  }
  

  getDependencyRiskTransitions(dependencyRiskId: string): Promise<protocol.GetDependencyRiskTransitionsResponse> {
    return this.sendRequest(protocol.GetDependencyRiskTransitions.type, { dependencyRiskId });
  }

  helpAndFeedbackLinkClicked(itemId: string) {
    this.sendNotification(protocol.HelpAndFeedbackLinkClicked.type, { id: itemId });
  }

  lmToolCalled(toolName: string, success: boolean) {
    this.sendNotification(protocol.LMToolCalled.type, { toolName, success });
  }

  scanFolderForHotspots(params: protocol.ScanFolderForHotspotsParams) {
    this.sendNotification(protocol.ScanFolderForHotspots.type, params);
  }

  forgetFolderHotspots() {
    this.sendNotification(protocol.ForgetFolderHotspots.type);
  }

  getFilePatternsForAnalysis(folderUri: string): Promise<protocol.GetFilePatternsForAnalysisResponse> {
    return this.sendRequest(protocol.GetFilePatternsForAnalysis.type, { uri: folderUri });
  }

  getAllowedHotspotStatuses(
    hotspotKey: string,
    folderUri: string,
    fileUri: string
  ): Promise<protocol.GetAllowedHotspotStatusesResponse> {
    return this.sendRequest(protocol.GetAllowedHotspotStatuses.type, { hotspotKey, folderUri, fileUri });
  }

  getSuggestedBinding(configScopeId: string, connectionId: string): Promise<protocol.GetSuggestedBindingResponse> {
    return this.sendRequest(protocol.GetSuggestedBinding.type, { configScopeId, connectionId });
  }

  getConnectionSuggestions(configurationScopeId: string): Promise<protocol.GetConnectionSuggestionsResponse> {
    return this.sendRequest(protocol.GetSuggestedConnections.type, { configurationScopeId })
  }

  getSharedConnectedModeConfigFileContent(
    configScopeId: string
  ): Promise<protocol.GetSharedConnectedModeConfigFileResponse> {
    return this.sendRequest(protocol.GetSharedConnectedModeConfigFileContents.type, { configScopeId });
  }

  checkIssueStatusChangePermitted(
    folderUri: string,
    issueKey: string
  ): Promise<protocol.CheckIssueStatusChangePermittedResponse> {
    return this.sendRequest(protocol.CheckIssueStatusChangePermitted.type, { folderUri, issueKey });
  }

  changeIssueStatus(
    configurationScopeId: string,
    issueId: string,
    newStatus: string,
    fileUri: string,
    comment: string,
    isTaintIssue: boolean
  ): Promise<void> {
    return this.sendNotification(protocol.SetIssueStatus.type, {
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
    return this.sendNotification(protocol.ChangeDependencyRiskStatus.type, { configurationScopeId, dependencyRiskKey, transition, comment });
  }

  reopenResolvedLocalIssues(configurationScopeId: string, relativePath: string, fileUri: string): Promise<void> {
    return this.sendNotification(protocol.ReopenResolvedLocalIssues.type, {
      configurationScopeId,
      relativePath,
      fileUri
    });
  }

  analyseOpenFileIgnoringExcludes(
    textDocument?: AnalysisFile,
    notebookDocument?: VSCode.NotebookDocument,
    notebookCells?: AnalysisFile[]
  ): Promise<void> {
    return this.sendNotification(protocol.AnalyseOpenFileIgnoringExcludes.type, {
      textDocument,
      notebookUri: notebookDocument ? notebookDocument.uri.toString() : null,
      notebookVersion: notebookDocument ? notebookDocument.version : null,
      notebookCells
    });
  }

  changeHotspotStatus(hotspotKey: string, newStatus: string, fileUri: string): Promise<void> {
    return this.sendNotification(protocol.SetHotspotStatus.type, { hotspotKey, newStatus, fileUri });
  }

  checkLocalHotspotsDetectionSupported(folderUri: string): Promise<protocol.CheckLocalDetectionSupportedResponse> {
    return this.sendRequest(protocol.CheckLocalDetectionSupported.type, { uri: folderUri });
  }

  getHotspotDetails(hotspotId, fileUri): Promise<protocol.ShowRuleDescriptionParams> {
    return this.sendRequest(protocol.GetHotspotDetails.type, { hotspotId, fileUri });
  }

  didCreateBinding(mode: protocol.BindingCreationMode): Promise<void> {
    return this.sendNotification(protocol.DidCreateBinding.type, mode);
  }

  listUserOrganizations(token: string, region: string) : Promise<Organization[]> {
    return this.sendRequest(protocol.ListUserOrganizations.type, { token, region })
  }

  fixSuggestionResolved(suggestionId: string, accepted: boolean): Promise<void> {
    return this.sendNotification(protocol.FixSuggestionResolved.type, { suggestionId, accepted });
  }

  findingsFiltered(filterType: string): Promise<void> {
    return this.sendNotification(protocol.FindingsFilteredNotification.type, { filterType });
  }
}
