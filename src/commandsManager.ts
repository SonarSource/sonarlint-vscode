/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import { showLogOutput } from './util/logging';
import { enableVerboseLogs } from './settings/settings';
import { AllRulesTreeDataProvider, LanguageNode, RuleNode, toggleRule } from './rules/rules';
import { FindingNode } from './findings/findingTypes/findingNode';
import { SonarLintExtendedLanguageClient } from './lsp/client';
import { openSonarQubeRulesFile, introduceSonarQubeRulesFile } from './aiAgentsConfiguration/aiAgentRuleConfig';
import { configureMCPServer, openMCPServerConfigurationFile } from './aiAgentsConfiguration/mcpServerConfig';
import { configureCompilationDatabase } from './cfamily/cfamily';
import { AutoBindingService } from './connected/autobinding';
import { BindingService } from './connected/binding';
import { AllConnectionsTreeDataProvider, ConnectionType, ConnectionsNode } from './connected/connections';
import {
  connectToSonarQube,
  connectToSonarCloud,
  editSonarQubeConnection,
  editSonarCloudConnection
} from './connected/connectionsetup';
import { SharedConnectedModeSettingsService } from './connected/sharedConnectedModeSettingsService';
import { helpAndFeedbackLinkClicked } from './help/linkTelemetry';
import {
  showHotspotDetails,
  changeHotspotStatus,
  showHotspotDescription,
  useProvidedFolderOrPickManuallyAndScan,
  getFilesForHotspotsAndLaunchScan
} from './hotspot/hotspots';
import { IssueService } from './issue/issue';
import { resolveIssueMultiStepInput } from './issue/resolveIssue';
import { navigateToLocation } from './location/locations';
import { ExtendedServer } from './lsp/protocol';
import { FlightRecorderService } from './monitoring/flightrecorder';
import { ConnectionSettingsService } from './settings/connectionsettings';
import { installManagedJre } from './util/requirements';
import { AIAgentsConfigurationTreeDataProvider } from './aiAgentsConfiguration/aiAgentsConfigurationTreeDataProvider';
import { Commands } from './util/commands';
import { getCurrentAgentWithHookSupport, installHook, openHookConfiguration, openHookScript, uninstallHook } from './aiAgentsConfiguration/aiAgentHooks';
import { code2ProtocolConverter } from './util/uri';

export class CommandsManager {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly languageClient: SonarLintExtendedLanguageClient,
    private readonly allRulesTreeDataProvider: AllRulesTreeDataProvider,
    private readonly allRulesView: vscode.TreeView<LanguageNode>,
    private readonly allConnectionsTreeDataProvider: AllConnectionsTreeDataProvider,
    private readonly allConnectionsView: vscode.TreeView<ConnectionsNode>,
    private readonly aiAgentsConfigurationTreeDataProvider: AIAgentsConfigurationTreeDataProvider
  ) {}

  registerCommands() {
    this.context.subscriptions.push(
      vscode.commands.registerCommand('SonarLint.OpenSample', async () => {
        const sampleFileUri = vscode.Uri.joinPath(this.context.extensionUri, 'walkthrough', 'sample.py');
        const sampleDocument = await vscode.workspace.openTextDocument(sampleFileUri);
        await vscode.window.showTextDocument(sampleDocument, vscode.ViewColumn.Beside);
      }),
      vscode.commands.registerCommand(Commands.SHOW_ALL_LOCATIONS, IssueService.showAllLocations),
      vscode.commands.registerCommand(Commands.CLEAR_LOCATIONS, IssueService.clearLocations),
      vscode.commands.registerCommand(Commands.NAVIGATE_TO_LOCATION, navigateToLocation),
      vscode.commands.registerCommand(Commands.DEACTIVATE_RULE, toggleRule('off')),
      vscode.commands.registerCommand(Commands.ACTIVATE_RULE, toggleRule('on')),
      vscode.commands.registerCommand(Commands.SHOW_HOTSPOT_RULE_DESCRIPTION, hotspot =>
        this.languageClient.showHotspotRuleDescription(hotspot.key, hotspot.fileUri)
      ),
      vscode.commands.registerCommand(Commands.SHOW_HOTSPOT_DETAILS, async hotspot => {
        const hotspotDetails = await this.languageClient.getHotspotDetails(hotspot.key, hotspot.fileUri);
        showHotspotDetails(hotspotDetails, hotspot);
      }),
      vscode.commands.registerCommand(Commands.OPEN_HOTSPOT_ON_SERVER, hotspot =>
        this.languageClient.openHotspotOnServer(hotspot.key, hotspot.fileUri)
      ),
      vscode.commands.registerCommand(Commands.SHOW_HOTSPOT_LOCATION, (hotspot: FindingNode) =>
        this.languageClient.showHotspotLocations(hotspot.key, hotspot.fileUri)
      ),
      vscode.commands.registerCommand(Commands.CLEAR_HOTSPOT_HIGHLIGHTING, IssueService.clearLocations),
      vscode.commands.registerCommand(Commands.SHOW_ALL_RULES, () => this.allRulesTreeDataProvider.filter(null)),
      vscode.commands.registerCommand(Commands.SHOW_ACTIVE_RULES, () => this.allRulesTreeDataProvider.filter('on')),
      vscode.commands.registerCommand(Commands.SHOW_INACTIVE_RULES, () => this.allRulesTreeDataProvider.filter('off')),
      vscode.commands.registerCommand(Commands.CHANGE_HOTSPOT_STATUS, hotspot =>
        changeHotspotStatus(hotspot.serverIssueKey, hotspot.fileUri, this.languageClient)
      ),
      vscode.commands.registerCommand(Commands.OPEN_RULE_BY_KEY, async (ruleKey: string) => {
        await vscode.commands.executeCommand(Commands.SHOW_ALL_RULES);
        await this.allRulesView.reveal(new RuleNode({ key: ruleKey.toUpperCase() } as ExtendedServer.Rule), {
          focus: true,
          expand: true
        });
      }),
      vscode.commands.registerCommand(Commands.FIND_RULE_BY_KEY, async () => {
        const key = await vscode.window.showInputBox({
          prompt: 'Rule Key',
          validateInput: value => this.allRulesTreeDataProvider.checkRuleExists(value)
        });
        if (key) {
          await vscode.commands.executeCommand(Commands.OPEN_RULE_BY_KEY, key);
        }
      }),
      vscode.commands.registerCommand(Commands.SHOW_SONARLINT_OUTPUT, () => showLogOutput()),
      vscode.commands.registerCommand(Commands.ENABLE_LOGS_AND_SHOW_OUTPUT, () => {
        enableVerboseLogs();
        showLogOutput();
      }),
      vscode.commands.registerCommand('SonarLint.NewCodeDefinition.Enable', () => {
        vscode.workspace
          .getConfiguration('sonarlint')
          .update('focusOnNewCode', true, vscode.ConfigurationTarget.Global);
      }),
      vscode.commands.registerCommand('SonarLint.NewCodeDefinition.Disable', () => {
        vscode.workspace
          .getConfiguration('sonarlint')
          .update('focusOnNewCode', false, vscode.ConfigurationTarget.Global);
      }),
      vscode.commands.registerCommand('SonarLint.AutomaticAnalysis.Enable', () => {
        vscode.workspace
          .getConfiguration('sonarlint')
          .update('automaticAnalysis', true, vscode.ConfigurationTarget.Global);
      }),
      vscode.commands.registerCommand('SonarLint.AutomaticAnalysis.Disable', () => {
        vscode.workspace
          .getConfiguration('sonarlint')
          .update('automaticAnalysis', false, vscode.ConfigurationTarget.Global);
      }),
      vscode.commands.registerCommand(Commands.INSTALL_MANAGED_JRE, installManagedJre),
      vscode.commands.registerCommand(Commands.SHOW_HOTSPOT_DESCRIPTION, showHotspotDescription),
      vscode.commands.registerCommand(Commands.CONFIGURE_COMPILATION_DATABASE, configureCompilationDatabase),
      vscode.commands.registerCommand(Commands.AUTO_BIND_WORKSPACE_FOLDERS, () =>
        AutoBindingService.instance.autoBindWorkspace()
      ),
      vscode.commands.registerCommand(Commands.CONNECT_TO_SONARQUBE, () => connectToSonarQube(this.context)()),
      vscode.commands.registerCommand(Commands.CONNECT_TO_SONARCLOUD, () => connectToSonarCloud(this.context)()),
      vscode.commands.registerCommand(Commands.EDIT_SONARQUBE_CONNECTION, editSonarQubeConnection(this.context)),
      vscode.commands.registerCommand(Commands.EDIT_SONARCLOUD_CONNECTION, editSonarCloudConnection(this.context)),
      vscode.commands.registerCommand(Commands.ADD_PROJECT_BINDING, connection =>
        BindingService.instance.createOrEditBinding(connection.id, connection.contextValue)
      ),
      vscode.commands.registerCommand(
        Commands.RESOLVE_ISSUE,
        (workspaceUri: string, issueKey: string, fileUri: string, isTaintIssue: boolean, isDependencyRisk = false) =>
          resolveIssueMultiStepInput(workspaceUri, issueKey, fileUri, isTaintIssue, isDependencyRisk)
      ),
      vscode.commands.registerCommand(Commands.REOPEN_LOCAL_ISSUES, () => {
        IssueService.instance.reopenLocalIssues();
      }),
      vscode.commands.registerCommand(Commands.REMOVE_CONNECTION, async connection => {
        const connectionDeleted = await ConnectionSettingsService.instance.removeConnection(connection);
        if (connectionDeleted) {
          BindingService.instance.deleteBindingsForConnection(connection);
        }
      }),
      vscode.commands.registerCommand(Commands.EDIT_PROJECT_BINDING, binding =>
        BindingService.instance.createOrEditBinding(
          binding.connectionId,
          binding.contextValue,
          binding.uri,
          binding.serverType
        )
      ),
      vscode.commands.registerCommand(Commands.SHARE_CONNECTED_MODE_CONFIG, binding =>
        SharedConnectedModeSettingsService.instance.askConfirmationAndCreateSharedConnectedModeSettingsFile(binding.uri)
      ),
      vscode.commands.registerCommand(Commands.REMOVE_PROJECT_BINDING, binding =>
        BindingService.instance.deleteBindingWithConfirmation(binding)
      ),
      vscode.commands.registerCommand(
        Commands.TRIGGER_HELP_AND_FEEDBACK_LINK,
        helpAndFeedbackLinkClicked(this.languageClient)
      ),
      vscode.commands.registerCommand(Commands.SCAN_FOR_HOTSPOTS_IN_FOLDER, async folder => {
        await this._scanFolderForHotspotsCommandHandler(folder);
      }),
      vscode.commands.registerCommand(Commands.FORGET_FOLDER_HOTSPOTS, () =>
        this.languageClient.forgetFolderHotspots()
      ),
      vscode.commands.registerCommand(Commands.ENABLE_VERBOSE_LOGS, () => enableVerboseLogs()),
      vscode.commands.registerCommand(Commands.ANALYSE_OPEN_FILE, () => {
        IssueService.instance.analyseOpenFileIgnoringExcludes(true);
        vscode.commands.executeCommand('SonarQube.Findings.focus');
      }),
      vscode.commands.registerCommand(Commands.ANALYZE_VCS_CHANGED_FILES, () => {
        const workspaceFolderUris = vscode.workspace.workspaceFolders?.map(f => code2ProtocolConverter(f.uri));
        this.languageClient.sendNotification(ExtendedServer.AnalyzeVCSChangedFiles.type, {
          configScopeIds: workspaceFolderUris
        });
        vscode.commands.executeCommand('SonarQube.Findings.focus');
      }),
      vscode.commands.registerCommand(
        Commands.FOCUS_ON_CONNECTION,
        async (connectionType: ConnectionType, connectionId?: string) => {
          const connectionsOfType = await this.allConnectionsTreeDataProvider.getConnections(connectionType);
          // find connection with ID, or focus on the first one of given type
          const targetConnection = connectionsOfType.find(c => c.id === connectionId) ?? connectionsOfType[0];
          this.allConnectionsView.reveal(targetConnection, { select: true, focus: true, expand: false });
        }
      ),
      vscode.commands.registerCommand(Commands.SHOW_FLIGHT_RECORDING_MENU, () =>
        FlightRecorderService.instance.showFlightRecordingMenu()
      ),
      vscode.commands.registerCommand(Commands.COPY_FLIGHT_RECORDER_SESSION_ID, () =>
        FlightRecorderService.instance.copySessionIdToClipboard()
      ),
      vscode.commands.registerCommand(Commands.DUMP_BACKEND_THREADS, () => {
        this.languageClient.dumpThreads();
      }),
      vscode.commands.registerCommand(Commands.CONFIGURE_MCP_SERVER, connection => {
        configureMCPServer(this.languageClient, this.allConnectionsTreeDataProvider, connection);
        this.aiAgentsConfigurationTreeDataProvider.refresh();
      }),
      vscode.commands.registerCommand(Commands.OPEN_MCP_SERVER_CONFIGURATION, () => openMCPServerConfigurationFile()),
      vscode.commands.registerCommand(Commands.REFRESH_AI_AGENTS_CONFIGURATION, () =>
        this.aiAgentsConfigurationTreeDataProvider.refresh()
      ),
      vscode.commands.registerCommand(Commands.OPEN_AIAGENTS_CONFIGURATION_DOC, () => {
        vscode.commands.executeCommand(Commands.TRIGGER_HELP_AND_FEEDBACK_LINK, 'aiAgentsConfigurationDoc');
      }),
      vscode.commands.registerCommand(Commands.OPEN_SONARQUBE_RULES_FILE, () => openSonarQubeRulesFile()),
      vscode.commands.registerCommand(Commands.INTRODUCE_SONARQUBE_RULES_FILE, () =>
        introduceSonarQubeRulesFile(this.languageClient)
      ),
      vscode.commands.registerCommand(Commands.INSTALL_AI_AGENT_HOOK_SCRIPT, () => {
        const agent = getCurrentAgentWithHookSupport();
        if (agent) {
          installHook(this.languageClient, agent);
        }
      }),
      vscode.commands.registerCommand(Commands.UNINSTALL_AI_AGENT_HOOK_SCRIPT, () => {
        const agent = getCurrentAgentWithHookSupport();
        if (agent) {
          uninstallHook(agent);
        }
      }),
      vscode.commands.registerCommand(Commands.OPEN_AI_AGENT_HOOK_SCRIPT, () => {
        const agent = getCurrentAgentWithHookSupport();
        if (agent) {
          openHookScript(agent);
        }
      }),
      vscode.commands.registerCommand(Commands.OPEN_AI_AGENT_HOOK_CONFIGURATION, () => {
        const agent = getCurrentAgentWithHookSupport();
        if (agent) {
          openHookConfiguration(agent);
        }
      })
    );
  }

  private async _scanFolderForHotspotsCommandHandler(folderUri: vscode.Uri) {
    await useProvidedFolderOrPickManuallyAndScan(
      folderUri,
      vscode.workspace.workspaceFolders,
      this.languageClient,
      getFilesForHotspotsAndLaunchScan
    );
  }
}
