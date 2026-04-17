/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as ChildProcess from 'node:child_process';
import * as FS from 'node:fs';
import * as Path from 'node:path';
import * as vscode from 'vscode';
import { logToSonarLintOutput, showLogOutput } from './util/logging';
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
import { DEFAULT_CONNECTION_ID } from './commons';
import {
  connectToSonarQube,
  connectToSonarCloud,
  editSonarQubeConnection,
  editSonarCloudConnection
} from './connected/connectionsetup';
import { SharedConnectedModeSettingsService } from './connected/sharedConnectedModeSettingsService';
import { helpAndFeedbackLinkClicked } from './help/linkTelemetry';
import { PluginStatusPanel } from './plugin/pluginStatusPanel';
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
import { ConnectionSettingsService, SonarCloudRegion } from './settings/connectionsettings';
import { installManagedJre, resolveRequirements } from './util/requirements';
import { AIAgentsConfigurationTreeDataProvider } from './aiAgentsConfiguration/aiAgentsConfigurationTreeDataProvider';
import { Commands } from './util/commands';
import {
  installHook,
  openHookConfiguration,
  openHookScript,
  uninstallHook
} from './aiAgentsConfiguration/aiAgentHooks';
import { getCurrentAgentWithHookSupport } from './aiAgentsConfiguration/aiAgentUtils';
import { code2ProtocolConverter } from './util/uri';
import { StatusBarService } from './statusbar/statusBar';
import { RemediationService } from './remediationPanel/remediationService';
import { IdeLabsFlagManagementService } from './labs/ideLabsFlagManagementService';

// TODO: Resolve Sonar API URLs from backend endpoint data so that this stays aligned with the rest of the system.
const SONARCLOUD_REGION_API_URL_MAP: Record<SonarCloudRegion, string> = {
  EU: 'https://api.sonarcloud.io',
  US: 'https://api.sonarqube.us'
};

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
      vscode.commands.registerCommand(Commands.CLEAR_REMEDIATION_EVENTS, () => {
        if (IdeLabsFlagManagementService.instance.isIdeLabsEnabled()) {
          RemediationService.instance.clearEvents();
        }
      }),
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
        if (!workspaceFolderUris) {
          vscode.window.showWarningMessage(
            'No workspace folders found; Ignoring request to analyze VCS changed files.'
          );
          return;
        }
        this.languageClient.sendNotification(ExtendedServer.AnalyzeVCSChangedFiles.type, {
          configScopeIds: workspaceFolderUris
        });
        vscode.commands.executeCommand('SonarQube.Findings.focus');
      }),
      vscode.commands.registerCommand(Commands.RUN_SCA_CLI_PROOF_OF_CONCEPT, async () => {
        await this.runScaCliProofOfConcept();
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
      vscode.commands.registerCommand(Commands.SHOW_STATUS_BAR_MENU, () =>
        StatusBarService.instance.showQuickPickMenu()
      ),
      vscode.commands.registerCommand(Commands.START_FLIGHT_RECORDER, async () => {
        try {
          const requirements = await resolveRequirements(this.context);
          await FlightRecorderService.instance.startRecording(requirements.javaHome);
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to start Flight Recorder: ${error.message}`);
        }
      }),
      vscode.commands.registerCommand(Commands.STOP_FLIGHT_RECORDER, () =>
        FlightRecorderService.instance.stopRecording()
      ),
      vscode.commands.registerCommand(Commands.DUMP_BACKEND_THREADS, () =>
        FlightRecorderService.instance.captureThreadDump()
      ),
      vscode.commands.registerCommand(Commands.CAPTURE_HEAP_DUMP, () =>
        FlightRecorderService.instance.captureHeapDump()
      ),
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
      }),
      vscode.commands.registerCommand(Commands.SHOW_SUPPORTED_LANGUAGES, async () => {
        await PluginStatusPanel.showSupportedLanguages(this.context, this.languageClient);
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

  private async runScaCliProofOfConcept() {
    const jarPath = Path.resolve(this.context.extensionPath, 'server', 'sca-cli-core.jar');

    if (!FS.existsSync(jarPath)) {
      const message = `SCA proof-of-concept JAR not found: ${jarPath}`;
      logToSonarLintOutput(message);
      showLogOutput();
      vscode.window.showErrorMessage(message);
      return;
    }

    try {
      const workspaceFolder = await this.getWorkspaceFolderForScaCli();
      if (!workspaceFolder) {
        return;
      }

      if (!BindingService.instance.isBound(workspaceFolder)) {
        const message = `Workspace folder '${workspaceFolder.name}' is not bound to a SonarQube connection.`;
        logToSonarLintOutput(message);
        vscode.window.showErrorMessage(message);
        return;
      }

      const connectionId = BindingService.instance.getConnectionIdForFolder(workspaceFolder) ?? DEFAULT_CONNECTION_ID;
      const connectionDetails = await this.getScaConnectionDetails(connectionId);

      if (!connectionDetails) {
        const message = `Could not resolve the SonarQube connection for workspace folder '${workspaceFolder.name}'.`;
        logToSonarLintOutput(message);
        vscode.window.showErrorMessage(message);
        return;
      }

      if (!connectionDetails.sonarToken) {
        const message = `Connection '${connectionDetails.connectionLabel}' does not have a token configured.`;
        logToSonarLintOutput(message);
        vscode.window.showErrorMessage(message);
        return;
      }

      const requirements = await resolveRequirements(this.context);
      const javaExecutable = Path.resolve(
        requirements.javaHome,
        'bin',
        process.platform === 'win32' ? 'java.exe' : 'java'
      );
      const args = [
        '-jar',
        jarPath,
        // Scan the currently selected workspace folder.
        '--base-dir',
        workspaceFolder.uri.fsPath,
        // Base URL for the SCA service endpoints.
        '--api-base-url',
        connectionDetails.apiBaseUrl,
        // Reuse the bound Sonar connection token for API authentication.
        '--sonar-token',
        connectionDetails.sonarToken,

        // Optional: scanners usually use `.scannerwork`; this is where
        // `dependency-files.tar.xz` will be written.
        // '--work-dir',
        // "",

        // Optional: cache location for the managed Tidelift executable.
        // '--cache-dir',
        // "",

        // Forward any connection-specific request headers here.
        // '--header',
        // 'name=value',

        // Pass scanner properties. SCA is mainly interested in `sonar.sca.*`, but you could also just send them all
        // '--scanner-property',
        // 'sonar.sca.example=value',

        // Pass through environment variables SCA and also for CLIs invoked by SCA. (npm, gradle, etc).
        // This should probably just be all environment variables so we are respecting the user's environment.
        // '--environment-override',
        // 'NAME=value',

        // This should be wired to `sonar.exclusions`
        // '--excluded-path',
        // 'pattern',

        // This should be wired to `sonar.scm.exclusions.disabled`
        // '--include-git-ignored-paths',

        // Keep debug on in the POC for stack traces and CLI diagnostics.
        '--debug'
      ];
      let archivePath: string | undefined;
      const redactedCommand = [
        javaExecutable,
        ...args.map((arg, index) => (args[index - 1] === '--sonar-token' ? '***' : arg))
      ];

      logToSonarLintOutput(`Starting SCA proof-of-concept JAR: ${jarPath}`);
      logToSonarLintOutput(`Executing ${JSON.stringify(redactedCommand)}`);
      showLogOutput();

      const childProcess = ChildProcess.spawn(javaExecutable, args, {
        cwd: workspaceFolder.uri.fsPath
      });

      childProcess.stdout.on('data', data => {
        const output = data.toString().trimEnd();
        logToSonarLintOutput(output);

        for (const line of output.split(/\r?\n/)) {
          const parsedOutput = this.tryParseScaCliResult(line);
          if (parsedOutput?.archive) {
            archivePath = parsedOutput.archive;
          }
        }
      });

      childProcess.stderr.on('data', data => {
        logToSonarLintOutput(data.toString().trimEnd());
      });

      childProcess.on('error', error => {
        const message = `Failed to run SCA proof-of-concept JAR: ${error.message}`;
        logToSonarLintOutput(message);
        vscode.window.showErrorMessage(message);
      });

      childProcess.on('close', exitCode => {
        const message = archivePath
          ? `SCA proof-of-concept JAR exited with code ${exitCode ?? 'unknown'}. Archive: ${archivePath}`
          : `SCA proof-of-concept JAR exited with code ${exitCode ?? 'unknown'}`;
        logToSonarLintOutput(message);
        vscode.window.showInformationMessage(message);
      });
    } catch (error) {
      const message = `Failed to resolve Java for SCA proof of concept: ${error.message}`;
      logToSonarLintOutput(message);
      showLogOutput();
      vscode.window.showErrorMessage(message);
    }
  }

  private async getWorkspaceFolderForScaCli(): Promise<vscode.WorkspaceFolder | undefined> {
    const activeWorkspaceFolder = vscode.window.activeTextEditor
      ? vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri)
      : undefined;
    if (activeWorkspaceFolder) {
      return activeWorkspaceFolder;
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      const message = 'No workspace folder is open.';
      logToSonarLintOutput(message);
      vscode.window.showErrorMessage(message);
      return undefined;
    }

    if (workspaceFolders.length === 1) {
      return workspaceFolders[0];
    }

    const selectedFolderName = await vscode.window.showQuickPick(
      workspaceFolders.map(folder => folder.name),
      {
        title: 'Select Workspace Folder',
        placeHolder: 'Select the workspace folder to analyze with the SCA CLI'
      }
    );

    return workspaceFolders.find(folder => folder.name === selectedFolderName);
  }

  private async getScaConnectionDetails(connectionId: string): Promise<
    | {
        connectionLabel: string;
        apiBaseUrl: string;
        sonarToken?: string;
      }
    | undefined
  > {
    const sonarQubeConnection = await ConnectionSettingsService.instance.loadSonarQubeConnection(connectionId);
    if (sonarQubeConnection) {
      return {
        connectionLabel: connectionId,
        apiBaseUrl: this.getScaServiceUrl(sonarQubeConnection.serverUrl),
        sonarToken: sonarQubeConnection.token
      };
    }

    const sonarCloudConnection = await ConnectionSettingsService.instance.loadSonarCloudConnection(connectionId);
    if (sonarCloudConnection) {
      const region = sonarCloudConnection.region ?? 'EU';
      return {
        connectionLabel: connectionId,
        apiBaseUrl: this.getScaServiceUrl(SONARCLOUD_REGION_API_URL_MAP[region]),
        sonarToken: sonarCloudConnection.token
      };
    }

    return undefined;
  }

  private getScaServiceUrl(baseUrl: string): string {
    return new URL('sca/', `${baseUrl.replace(/\/+$/, '')}/`).toString();
  }

  private tryParseScaCliResult(line: string): { archive?: string } | undefined {
    try {
      const parsed = JSON.parse(line) as { archive?: unknown };
      return typeof parsed.archive === 'string' ? { archive: parsed.archive } : undefined;
    } catch {
      return undefined;
    }
  }
}
