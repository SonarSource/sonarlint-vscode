/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
import * as VSCode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { ServerMode } from '../java/java';
import { code2ProtocolConverter } from '../util/uri';
import * as protocol from './protocol';
import { ShowRuleDescriptionParams } from './protocol';

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

  getRemoteProjectNames(connectionId: string, projectKeys: Array<string>) {
    return this.sendRequest(protocol.GetRemoteProjectNames.type, { connectionId, projectKeys });
  }

  onTokenUpdate() {
    return this.sendNotification(protocol.OnTokenUpdate.type);
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

  showHotspotRuleDescription(ruleKey: string, hotspotId: string, fileUri: string) {
    this.sendNotification(protocol.ShowHotspotRuleDescriptionNotification.type, { ruleKey, hotspotId, fileUri });
  }

  openHotspotOnServer(hotspotId: string, fileUri: string) {
    this.sendNotification(protocol.OpenHotspotOnServer.type, { hotspotId, fileUri });
  }

  helpAndFeedbackLinkClicked(itemId: string) {
    this.sendNotification(protocol.HelpAndFeedbackLinkClicked.type, { id: itemId });
  }

  scanFolderForHotspots(params: protocol.ScanFolderForHotspotsParams) {
    this.sendNotification(protocol.ScanFolderForHotspots.type, params);
  }

  forgetFolderHotspots() {
    this.sendNotification(protocol.ForgetFolderHotspots.type);
  }

  getFilePatternsForAnalysis(folderUri: string): Promise<protocol.GetFilePatternsForAnalysisResponse> {
    return this.sendRequest(protocol.GetFilePatternsForAnalysis.type, { folderUri });
  }

  getSuggestedBinding(configScopeId: string, connectionId: string): Promise<protocol.GetSuggestedBindingResponse> {
    return this.sendRequest(protocol.GetSuggestedBinding.type, { configScopeId, connectionId });
  }

  changeIssueStatus(configurationScopeId: string, issueKey: string,
                    newStatus: string, fileUri: string, isTaintIssue: boolean): Promise<void> {
    return this.sendNotification(protocol.SetIssueStatus.type,
      { configurationScopeId, issueKey, newStatus, fileUri, isTaintIssue });
  }

  addIssueComment(configurationScopeId: string, issueKey: string, text: string): Promise<void>{
    return this.sendNotification(protocol.AddIssueComment.type, {configurationScopeId, issueKey, text});
  }

  checkLocalHotspotsDetectionSupported(folderUri: string): Promise<protocol.CheckLocalDetectionSupportedResponse> {
    return this.sendRequest(protocol.CheckLocalDetectionSupported.type, { folderUri });
  }

  getHotspotDetails(ruleKey, hotspotId, fileUri): Promise<ShowRuleDescriptionParams> {
    return this.sendRequest(protocol.GetHotspotDetails.type, { ruleKey, hotspotId, fileUri });
  }
}
