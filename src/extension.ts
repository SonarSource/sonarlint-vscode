/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

// Must be kept at the top for Node instrumentation to work correctly
import { MonitoringService } from './monitoring/monitoring';

import * as ChildProcess from 'child_process';
import { DateTime } from 'luxon';
import * as Path from 'path';
import * as VSCode from 'vscode';
import { LanguageClientOptions, StreamInfo } from 'vscode-languageclient/node';
import { configureCompilationDatabase, notifyMissingCompileCommands } from './cfamily/cfamily';
import { AutoBindingService } from './connected/autobinding';
import { assistCreatingConnection } from './connected/assistCreatingConnection';
import { BindingService, showSoonUnsupportedVersionMessage } from './connected/binding';
import { AllConnectionsTreeDataProvider, ConnectionsNode, ConnectionType } from './connected/connections';
import {
  connectToSonarCloud,
  connectToSonarQube,
  editSonarCloudConnection,
  editSonarQubeConnection,
  handleInvalidTokenNotification
} from './connected/connectionsetup';
import {
  HelpAndFeedbackLink,
  HelpAndFeedbackTreeDataProvider
} from './help/helpAndFeedbackTreeDataProvider';
import { AIAgentsConfigurationTreeDataProvider, AIAgentsConfigurationItem } from './aiAgentsConfiguration/aiAgentsConfigurationTreeDataProvider';
import {
  changeHotspotStatus,
  getFilesForHotspotsAndLaunchScan,
  showHotspotDescription,
  showHotspotDetails,
  showSecurityHotspot,
  useProvidedFolderOrPickManuallyAndScan
} from './hotspot/hotspots';
import { FindingsTreeDataProvider, FindingsTreeViewItem } from './findings/findingsTreeDataProvider';
import { FilterType, getFilterDisplayName } from './findings/findingsTreeDataProviderUtil';
import { getJavaConfig, installClasspathListener } from './java/java';
import { LocationTreeItem, navigateToLocation, SecondaryLocationsTree } from './location/locations';
import { SonarLintExtendedLanguageClient } from './lsp/client';
import { languageServerCommand } from './lsp/server';
import { showRuleDescription } from './rules/rulepanel';
import { AllRulesTreeDataProvider, LanguageNode, RuleNode, setRulesViewMessage, toggleRule } from './rules/rules';
import { initScm, isIgnoredByScm } from './scm/scm';
import { isFirstSecretDetected, showNotificationForFirstSecretsIssue } from './secrets/secrets';
import { ConnectionSettingsService, migrateConnectedModeSettings } from './settings/connectionsettings';
import {
  enableVerboseLogs,
  getCurrentConfiguration,
  isVerboseEnabled,
  loadInitialSettings,
  onConfigurationChange
} from './settings/settings';
import { Commands } from './util/commands';
import { getLogOutput, initLogOutput, logToSonarLintOutput, showLogOutput } from './util/logging';
import { getPlatform } from './util/platform';
import { installManagedJre, JAVA_HOME_CONFIG, resolveRequirements } from './util/requirements';
import { code2ProtocolConverter, protocol2CodeConverter } from './util/uri';
import * as util from './util/util';
import { filterOutFilesIgnoredForAnalysis, shouldAnalyseFile } from './util/util';
import { resolveIssueMultiStepInput } from './issue/resolveIssue';
import { IssueService } from './issue/issue';
import { CAN_SHOW_MISSING_REQUIREMENT_NOTIF, showSslCertificateConfirmationDialog } from './util/showMessage';
import { NewCodeDefinitionService } from './newcode/newCodeDefinitionService';
import { ExtendedClient, ExtendedServer } from './lsp/protocol';
import { maybeShowWiderLanguageSupportNotification } from './promotions/promotionalNotifications';
import { SharedConnectedModeSettingsService } from './connected/sharedConnectedModeSettingsService';
import { FileSystemServiceImpl } from './fileSystem/fileSystemServiceImpl';
import { FixSuggestionService } from './fixSuggestions/fixSuggestionsService';
import { ContextManager } from './contextManager';
import { ListPotentialSecurityIssuesTool } from './languageModelTools/listPotentialSecurityIssuesTool';
import { ExcludeFileOrFolderTool } from './languageModelTools/excludeFileOrFolderTool';
import { SetUpConnectedModeTool } from './languageModelTools/setUpConnectedModeTool';
import { AnalyzeFileTool } from './languageModelTools/analyzeFileTool';
import { TaintVulnerabilityDecorator } from './issue/taintVulnerabilityDecorator';
import { helpAndFeedbackLinkClicked } from './help/linkTelemetry';
import { FindingNode } from './findings/findingTypes/findingNode';
import { AutomaticAnalysisService } from './settings/automaticAnalysis';
import { FlightRecorderService } from './monitoring/flightrecorder';
import { configureMCPServer, onEmbeddedServerStarted, openMCPServerConfigurationFile } from './aiAgentsConfiguration/mcpServerConfig';
import { introduceSonarQubeRulesFile, openSonarQubeRulesFile } from './aiAgentsConfiguration/aiAgentRuleConfig';
import { IdeLabsFlagManagementService } from './labs/ideLabsFlagManagementService';

const DOCUMENT_SELECTOR = [
  { scheme: 'file', pattern: '**/*' },
  {
    notebook: {
      scheme: 'file',
      notebookType: 'jupyter-notebook'
    },
    language: 'python'
  }
];

let secondaryLocationsTree: SecondaryLocationsTree;
let issueLocationsView: VSCode.TreeView<LocationTreeItem>;
let languageClient: SonarLintExtendedLanguageClient;
let allRulesTreeDataProvider: AllRulesTreeDataProvider;
let allRulesView: VSCode.TreeView<LanguageNode>;
let allConnectionsView: VSCode.TreeView<ConnectionsNode>;
let allConnectionsTreeDataProvider: AllConnectionsTreeDataProvider;
let findingsTreeDataProvider: FindingsTreeDataProvider;
let findingsView: VSCode.TreeView<FindingsTreeViewItem>;
let helpAndFeedbackTreeDataProvider: HelpAndFeedbackTreeDataProvider;
let helpAndFeedbackView: VSCode.TreeView<HelpAndFeedbackLink>;
let aiAgentsConfigurationTreeDataProvider: AIAgentsConfigurationTreeDataProvider;
let aiAgentsConfigurationView: VSCode.TreeView<AIAgentsConfigurationItem>;
const currentProgress: Record<string, { progress: VSCode.Progress<{ increment?: number }>, resolve: () => void } | undefined> = {};

async function runJavaServer(context: VSCode.ExtensionContext): Promise<StreamInfo> {
  try {
    const requirements = await resolveRequirements(context);
    const { command, args } = await languageServerCommand(context, requirements);
    logToSonarLintOutput(`Executing ${command} ${args.join(' ')}`);
    const process = ChildProcess.spawn(command, args);
    process.stderr.on('data', function (data) {
      logWithPrefix(data, '[stderr]');
    });
    return {
      reader: process.stdout,
      writer: process.stdin
    }
  } catch (error) {
    //show error
    VSCode.window.showErrorMessage(error.message, error.label).then(selection => {
      if (error.label && error.label === selection && error.command) {
        VSCode.commands.executeCommand(error.command, error.commandParam);
      }
    });
    // rethrow to disrupt the chain.
    throw error;
  }
}

function logWithPrefix(data, prefix) {
  if (isVerboseEnabled()) {
    const lines: string[] = data.toString().split(/\r\n|\r|\n/);
    lines.forEach((l: string) => {
      if (l.length > 0) {
        logToSonarLintOutput(`${prefix} ${l}`);
      }
    });
  }
}

export function toUrl(filePath: string) {
  let pathName = Path.resolve(filePath).replace(/\\/g, '/');

  // Windows drive letter must be prefixed with a slash
  if (!pathName.startsWith('/')) {
    pathName = '/' + pathName;
  }

  return encodeURI('file://' + pathName);
}

export async function activate(context: VSCode.ExtensionContext) {
  const installTimeKey = 'install.time';
  context.globalState.setKeysForSync([installTimeKey]);
  let installTime = context.globalState.get(installTimeKey);
  if (!installTime) {
    installTime = new Date().toISOString();
    context.globalState.update(installTimeKey, installTime);
  }

  loadInitialSettings();
  util.setExtensionContext(context);
  initLogOutput(context);

  context.subscriptions.push(VSCode.env.createTelemetryLogger(MonitoringService.instance));

  const serverOptions = () => runJavaServer(context);

  const pythonWatcher = VSCode.workspace.createFileSystemWatcher('**/*.py');
  const helmWatcher = VSCode.workspace.createFileSystemWatcher('**/*.{y?ml,tpl,txt,toml}');
  const sharedConnectedModeConfigurationWatcher = VSCode.workspace.createFileSystemWatcher('**/.sonarlint/*.json');
  context.subscriptions.push(pythonWatcher);
  context.subscriptions.push(helmWatcher);
  context.subscriptions.push(sharedConnectedModeConfigurationWatcher);

  // Options to control the language client
  const clientOptions: LanguageClientOptions = {
    middleware: {
      handleDiagnostics: (uri, diagnostics, next) => {
        FindingsTreeDataProvider.instance.updateIssues(uri.toString(), diagnostics);
        next(uri, diagnostics); // Call the default handler
      }
    },
    documentSelector: DOCUMENT_SELECTOR,
    synchronize: {
      fileEvents: [pythonWatcher, helmWatcher, sharedConnectedModeConfigurationWatcher]
    },
    uriConverters: {
      code2Protocol: code2ProtocolConverter,
      protocol2Code: protocol2CodeConverter
    },
    diagnosticCollectionName: 'sonarlint',
    initializationOptions: () => {
      return {
        productKey: 'vscode',
        telemetryStorage: Path.resolve(context.extensionPath, '..', 'sonarlint_usage'),
        productName: 'SonarLint VSCode',
        productVersion: util.extensionVersionWithBuildNumber(),
        workspaceName: VSCode.workspace.name,
        firstSecretDetected: isFirstSecretDetected(context),
        showVerboseLogs: VSCode.workspace.getConfiguration().get('sonarlint.output.showVerboseLogs', false),
        platform: getPlatform(),
        architecture: process.arch,
        additionalAttributes: {
          vscode: {
            remoteName: cleanRemoteName(VSCode.env.remoteName),
            uiKind: VSCode.UIKind[VSCode.env.uiKind],
            installTime,
            isTelemetryEnabled: VSCode.env.isTelemetryEnabled,
            ...(VSCode.env.isTelemetryEnabled && { machineId: VSCode.env.machineId })
          },
        },
        enableNotebooks: true,
        clientNodePath: VSCode.workspace.getConfiguration().get('sonarlint.pathToNodeExecutable'),
        eslintBridgeServerPath: Path.resolve(context.extensionPath, 'eslint-bridge'),
        omnisharpDirectory: Path.resolve(context.extensionPath, 'omnisharp'),
        csharpOssPath: Path.resolve(context.extensionPath, 'analyzers', 'sonarcsharp.jar'),
        csharpEnterprisePath: Path.resolve(context.extensionPath, 'analyzers', 'csharpenterprise.jar'),
        connections: VSCode.workspace.getConfiguration('sonarlint.connectedMode').get('connections', {"sonarqube": [], "sonarcloud": []}),
        rules: VSCode.workspace.getConfiguration('sonarlint').get('rules', {}),
        focusOnNewCode: VSCode.workspace.getConfiguration('sonarlint').get('focusOnNewCode', false),
        automaticAnalysis: VSCode.workspace.getConfiguration('sonarlint').get('automaticAnalysis', true)
      };
    },
    outputChannel: getLogOutput(),
    revealOutputChannelOn: 4, // never
  };

  // Create the language client and start the client.
  // id parameter is used to load 'sonarlint.trace.server' configuration
  languageClient = new SonarLintExtendedLanguageClient(
    'sonarlint',
    'SonarLint Language Server',
    serverOptions,
    clientOptions
  );

  await languageClient.start();

  ConnectionSettingsService.init(context, languageClient);
  NewCodeDefinitionService.init(context);
  FileSystemServiceImpl.init();
  SharedConnectedModeSettingsService.init(languageClient, FileSystemServiceImpl.instance, context);
  BindingService.init(languageClient, context.workspaceState, ConnectionSettingsService.instance, SharedConnectedModeSettingsService.instance);
  AutoBindingService.init(BindingService.instance, context.workspaceState, ConnectionSettingsService.instance, FileSystemServiceImpl.instance, languageClient);
  migrateConnectedModeSettings(getCurrentConfiguration(), ConnectionSettingsService.instance).catch(e => {
    /* ignored */
  });
  FixSuggestionService.init(languageClient);
  IdeLabsFlagManagementService.init(context);
  
  ContextManager.instance.initializeContext(context);

  FindingsTreeDataProvider.init(context, languageClient);
  findingsTreeDataProvider = FindingsTreeDataProvider.instance;
  findingsView = VSCode.window.createTreeView('SonarQube.Findings', {
    treeDataProvider: findingsTreeDataProvider
  });
  context.subscriptions.push(findingsView);

  installCustomRequestHandlers(context);
  initializeLanguageModelTools(context);

  const referenceBranchStatusItem = VSCode.window.createStatusBarItem(VSCode.StatusBarAlignment.Left, 1);
  const automaticAnalysisStatusItem = VSCode.window.createStatusBarItem(VSCode.StatusBarAlignment.Left, 2);

  const scm = await initScm(languageClient, referenceBranchStatusItem);
  context.subscriptions.push(scm);
  context.subscriptions.push(
    languageClient.onNotification(ExtendedClient.SetReferenceBranchNameForFolderNotification.type, params => {
      scm.setReferenceBranchName(VSCode.Uri.parse(params.folderUri), params.branchName);
    })
  );
  context.subscriptions.push(referenceBranchStatusItem);
  context.subscriptions.push(automaticAnalysisStatusItem);

  VSCode.window.onDidChangeActiveTextEditor(e => {
    scm.updateReferenceBranchStatusItem(e);
    NewCodeDefinitionService.instance.updateNewCodeStatusBarItem(e);
    FindingsTreeDataProvider.instance.refresh();
  });

  allRulesTreeDataProvider = new AllRulesTreeDataProvider(() => languageClient.listAllRules());
  allRulesView = VSCode.window.createTreeView('SonarLint.AllRules', {
    treeDataProvider: allRulesTreeDataProvider
  });
  setRulesViewMessage(allRulesView);
  context.subscriptions.push(allRulesView);

  secondaryLocationsTree = new SecondaryLocationsTree();
  issueLocationsView = VSCode.window.createTreeView('SonarLint.IssueLocations', {
    treeDataProvider: secondaryLocationsTree
  });
  context.subscriptions.push(issueLocationsView);

  IssueService.init(languageClient, secondaryLocationsTree, issueLocationsView);

  context.subscriptions.push(languageClient.onNotification(ExtendedClient.ShowIssueNotification.type, IssueService.showIssue));
  
  context.subscriptions.push(languageClient.onNotification(ExtendedClient.StartProgressNotification.type, (params: ExtendedClient.StartProgressNotificationParams) => {
    const taskId = params.taskId;
    if (currentProgress[taskId]) {
      // If there's an existing progress, resolve it first
      currentProgress[taskId].resolve();
    }
    
    VSCode.window.withProgress(
      {
        location: VSCode.ProgressLocation.Notification,
        title: 'SonarQube for IDE',
        cancellable: false
      },
      (progress) => {
        return new Promise<void>((resolve) => {
          currentProgress[taskId] = { progress, resolve };
          if (params.message) {
            progress.report({ message: params.message });
          }
        });
      }
    );
  }));

  context.subscriptions.push(languageClient.onNotification(ExtendedClient.EndProgressNotification.type, (params: ExtendedClient.EndProgressNotificationParams) => {
    const taskId = params.taskId
    if (currentProgress[taskId]) {
      currentProgress[taskId].resolve();
      currentProgress[taskId] = undefined;
    }
  }));

  const automaticAnalysisService = new AutomaticAnalysisService(automaticAnalysisStatusItem, findingsView);
  automaticAnalysisService.updateAutomaticAnalysisStatusBarAndFindingsViewMessage();

  VSCode.workspace.onDidChangeConfiguration(async event => {
    if (event.affectsConfiguration('sonarlint.rules')) {
      allRulesTreeDataProvider.refresh();
      setRulesViewMessage(allRulesView);
    }
    if (event.affectsConfiguration('sonarlint.connectedMode')) {
      allConnectionsTreeDataProvider.refresh();
      ContextManager.instance.initializeContext(context);
    }
    if (event.affectsConfiguration('sonarlint.focusOnNewCode')) {
      NewCodeDefinitionService.instance.updateFocusOnNewCodeState();
      findingsTreeDataProvider.refresh();
      TaintVulnerabilityDecorator.instance.updateTaintVulnerabilityDecorationsForFile();
    }
    if (event.affectsConfiguration('sonarlint.automaticAnalysis')) {
      automaticAnalysisService.updateAutomaticAnalysisStatusBarAndFindingsViewMessage();
    }
    if (event.affectsConfiguration('sonarlint')) {
      // only send notification to let language server pull the latest settings when the change is relevant
      languageClient.sendNotification('workspace/didChangeConfiguration', { settings: null })
    }
  });

  VSCode.workspace.onDidChangeWorkspaceFolders(async event => {
    for (const removed of event.removed) {
      FileSystemServiceImpl.instance.didRemoveWorkspaceFolder(removed);
    }

    for (const added of event.added) {
      FileSystemServiceImpl.instance.didAddWorkspaceFolder(added);
    }
  });

  registerCommands(context);

  allConnectionsTreeDataProvider = new AllConnectionsTreeDataProvider(languageClient);

  allConnectionsView = VSCode.window.createTreeView('SonarLint.ConnectedMode', {
    treeDataProvider: allConnectionsTreeDataProvider
  });
  context.subscriptions.push(allConnectionsView);

  automaticAnalysisStatusItem.show();
  
  // Update badge when tree data changes
  context.subscriptions.push(
    findingsTreeDataProvider.onDidChangeTreeData(() => {
      updateFindingsViewContainerBadge();
    })
  );

  helpAndFeedbackTreeDataProvider = new HelpAndFeedbackTreeDataProvider();
  helpAndFeedbackView = VSCode.window.createTreeView('SonarLint.HelpAndFeedback', {
    treeDataProvider: helpAndFeedbackTreeDataProvider
  });
  context.subscriptions.push(helpAndFeedbackView);

  aiAgentsConfigurationTreeDataProvider = new AIAgentsConfigurationTreeDataProvider();
  aiAgentsConfigurationView = VSCode.window.createTreeView('SonarLint.AIAgentsConfiguration', {
    treeDataProvider: aiAgentsConfigurationTreeDataProvider
  });
  context.subscriptions.push(aiAgentsConfigurationView);

  TaintVulnerabilityDecorator.init();

  context.subscriptions.push(onConfigurationChange());

  context.subscriptions.push(
    VSCode.extensions.onDidChange(() => {
      installClasspathListener(languageClient);
    })
  );
  installClasspathListener(languageClient);
}

/**
 * Inspired from https://github.com/microsoft/vscode-extension-telemetry/blob/4408adad49f6da5816c28467d90aec15773773a9/src/common/baseTelemetryReporter.ts#L63
 * Given a remoteName ensures it is in the list of valid ones
 * @param remoteName The remotename
 * @returns The "cleaned" one
 */
function cleanRemoteName(remoteName?: string): string {
  if (!remoteName) {
    return 'none';
  }

  let ret = 'other';
  // Allowed remote authorities
  ['ssh-remote', 'dev-container', 'attached-container', 'wsl', 'codespaces'].forEach((res: string) => {
    if (remoteName.startsWith(`${res}`)) {
      ret = res;
    }
  });

  return ret;
}

function suggestBinding(params: ExtendedClient.SuggestBindingParams) {
  logToSonarLintOutput(`Received binding suggestions: ${JSON.stringify(params)}`);
  AutoBindingService.instance.checkConditionsAndAttemptAutobinding(params);
}

function registerCommands(context: VSCode.ExtensionContext) {
  context.subscriptions.push(
    VSCode.commands.registerCommand('SonarLint.OpenSample', async () => {
      const sampleFileUri = VSCode.Uri.joinPath(context.extensionUri, 'walkthrough', 'sample.py');
      const sampleDocument = await VSCode.workspace.openTextDocument(sampleFileUri);
      await VSCode.window.showTextDocument(sampleDocument, VSCode.ViewColumn.Beside);
    })
  );
  context.subscriptions.push(VSCode.commands.registerCommand(Commands.SHOW_ALL_LOCATIONS, showAllLocations));
  context.subscriptions.push(VSCode.commands.registerCommand(Commands.CLEAR_LOCATIONS, clearLocations));
  context.subscriptions.push(VSCode.commands.registerCommand(Commands.NAVIGATE_TO_LOCATION, navigateToLocation));

  context.subscriptions.push(VSCode.commands.registerCommand(Commands.DEACTIVATE_RULE, toggleRule('off')));
  context.subscriptions.push(VSCode.commands.registerCommand(Commands.ACTIVATE_RULE, toggleRule('on')));

  context.subscriptions.push(
    VSCode.commands.registerCommand(Commands.SHOW_HOTSPOT_RULE_DESCRIPTION, hotspot =>
      languageClient.showHotspotRuleDescription(hotspot.key, hotspot.fileUri)
    )
  );

  context.subscriptions.push(
    VSCode.commands.registerCommand(Commands.SHOW_HOTSPOT_DETAILS, async hotspot => {
      const hotspotDetails = await languageClient.getHotspotDetails(hotspot.key, hotspot.fileUri);
      showHotspotDetails(hotspotDetails, hotspot);
    })
  );

  context.subscriptions.push(
    VSCode.commands.registerCommand(Commands.OPEN_HOTSPOT_ON_SERVER, hotspot =>
      languageClient.openHotspotOnServer(hotspot.key, hotspot.fileUri)
    )
  );

  context.subscriptions.push(
    VSCode.commands.registerCommand(Commands.SHOW_HOTSPOT_LOCATION, (hotspot: FindingNode) =>
      languageClient.showHotspotLocations(hotspot.key, hotspot.fileUri)
    )
  );

  context.subscriptions.push(VSCode.commands.registerCommand(Commands.CLEAR_HOTSPOT_HIGHLIGHTING, clearLocations));

  context.subscriptions.push(
    VSCode.commands.registerCommand(Commands.SHOW_ALL_RULES, () => allRulesTreeDataProvider.filter(null))
  );
  context.subscriptions.push(
    VSCode.commands.registerCommand(Commands.SHOW_ACTIVE_RULES, () => allRulesTreeDataProvider.filter('on'))
  );
  context.subscriptions.push(
    VSCode.commands.registerCommand(Commands.SHOW_INACTIVE_RULES, () => allRulesTreeDataProvider.filter('off'))
  );
  context.subscriptions.push(
    VSCode.commands.registerCommand(Commands.CHANGE_HOTSPOT_STATUS, hotspot =>
      changeHotspotStatus(hotspot.serverIssueKey, hotspot.fileUri, languageClient)
    )
  );
  context.subscriptions.push(
    VSCode.commands.registerCommand(Commands.OPEN_RULE_BY_KEY, async (ruleKey: string) => {
      await VSCode.commands.executeCommand(Commands.SHOW_ALL_RULES);
      await allRulesView.reveal(new RuleNode({ key: ruleKey.toUpperCase() } as ExtendedServer.Rule), {
        focus: true,
        expand: true
      });
    })
  );
  context.subscriptions.push(
    VSCode.commands.registerCommand(Commands.FIND_RULE_BY_KEY, async () => {
      const key = await VSCode.window.showInputBox({
        prompt: 'Rule Key',
        validateInput: value => allRulesTreeDataProvider.checkRuleExists(value)
      });
      if (key) {
        await VSCode.commands.executeCommand(Commands.OPEN_RULE_BY_KEY, key);
      }
    })
  );
  context.subscriptions.push(VSCode.commands.registerCommand(Commands.SHOW_SONARLINT_OUTPUT, () => showLogOutput()));

  context.subscriptions.push(VSCode.commands.registerCommand(Commands.ENABLE_LOGS_AND_SHOW_OUTPUT, () => {
    enableVerboseLogs();
    showLogOutput();
  }));

  context.subscriptions.push(
    VSCode.commands.registerCommand('SonarLint.NewCodeDefinition.Enable', () => {
      VSCode.workspace.getConfiguration('sonarlint')
              .update('focusOnNewCode', true, VSCode.ConfigurationTarget.Global);
    }),
    VSCode.commands.registerCommand('SonarLint.NewCodeDefinition.Disable', () => {
      VSCode.workspace.getConfiguration('sonarlint')
              .update('focusOnNewCode', false, VSCode.ConfigurationTarget.Global);
    })
  );

  context.subscriptions.push(
    VSCode.commands.registerCommand('SonarLint.AutomaticAnalysis.Enable', () => {
      VSCode.workspace.getConfiguration('sonarlint')
              .update('automaticAnalysis', true, VSCode.ConfigurationTarget.Global);
    }),
    VSCode.commands.registerCommand('SonarLint.AutomaticAnalysis.Disable', () => {
      VSCode.workspace.getConfiguration('sonarlint')
              .update('automaticAnalysis', false, VSCode.ConfigurationTarget.Global);
    })
  );

  context.subscriptions.push(VSCode.commands.registerCommand(Commands.INSTALL_MANAGED_JRE, installManagedJre));

  context.subscriptions.push(
    VSCode.commands.registerCommand(Commands.SHOW_HOTSPOT_DESCRIPTION, showHotspotDescription)
  );

  context.subscriptions.push(
    VSCode.commands.registerCommand(Commands.CONFIGURE_COMPILATION_DATABASE, configureCompilationDatabase)
  );

  context.subscriptions.push(
    VSCode.commands.registerCommand(Commands.AUTO_BIND_WORKSPACE_FOLDERS, () =>
      AutoBindingService.instance.autoBindWorkspace()
    )
  );

  context.subscriptions.push(
    VSCode.commands.registerCommand(Commands.CONNECT_TO_SONARQUBE, () => connectToSonarQube(context)())
  );
  context.subscriptions.push(
    VSCode.commands.registerCommand(Commands.CONNECT_TO_SONARCLOUD, () => connectToSonarCloud(context)())
  );
  context.subscriptions.push(
    VSCode.commands.registerCommand(Commands.EDIT_SONARQUBE_CONNECTION, editSonarQubeConnection(context))
  );
  context.subscriptions.push(
    VSCode.commands.registerCommand(Commands.EDIT_SONARCLOUD_CONNECTION, editSonarCloudConnection(context))
  );
  context.subscriptions.push(
    VSCode.commands.registerCommand(Commands.ADD_PROJECT_BINDING, connection =>
      BindingService.instance.createOrEditBinding(connection.id, connection.contextValue)
    )
  );
  context.subscriptions.push(
    VSCode.commands.registerCommand(
      Commands.RESOLVE_ISSUE,
      (workspaceUri: string, issueKey: string, fileUri: string, isTaintIssue: boolean, isDependencyRisk = false) =>
        resolveIssueMultiStepInput(workspaceUri, issueKey, fileUri, isTaintIssue, isDependencyRisk)
    )
  );
  context.subscriptions.push(
    VSCode.commands.registerCommand(Commands.REOPEN_LOCAL_ISSUES, () => {
      IssueService.instance.reopenLocalIssues();
    })
  );
  context.subscriptions.push(
    VSCode.commands.registerCommand(Commands.REMOVE_CONNECTION, async connection => {
      const connectionDeleted = await ConnectionSettingsService.instance.removeConnection(connection);
      if (connectionDeleted) {
        BindingService.instance.deleteBindingsForConnection(connection);
      }
    })
  );
  context.subscriptions.push(
    VSCode.commands.registerCommand(Commands.EDIT_PROJECT_BINDING, binding =>
      BindingService.instance.createOrEditBinding(
        binding.connectionId,
        binding.contextValue,
        binding.uri,
        binding.serverType
      )
    )
  );

  context.subscriptions.push(
    VSCode.commands.registerCommand(Commands.SHARE_CONNECTED_MODE_CONFIG, binding =>
      SharedConnectedModeSettingsService.instance.askConfirmationAndCreateSharedConnectedModeSettingsFile(binding.uri)
    )
  )
  context.subscriptions.push(
    VSCode.commands.registerCommand(Commands.REMOVE_PROJECT_BINDING, binding =>
      BindingService.instance.deleteBindingWithConfirmation(binding)
    )
  );

  context.subscriptions.push(
    VSCode.commands.registerCommand(Commands.TRIGGER_HELP_AND_FEEDBACK_LINK, helpAndFeedbackLinkClicked(languageClient))
  );

  context.subscriptions.push(
    VSCode.commands.registerCommand(Commands.SCAN_FOR_HOTSPOTS_IN_FOLDER, async folder => {
      await scanFolderForHotspotsCommandHandler(folder);
    })
  );

  context.subscriptions.push(
    VSCode.commands.registerCommand(Commands.FORGET_FOLDER_HOTSPOTS, () => languageClient.forgetFolderHotspots())
  );

  context.subscriptions.push(VSCode.commands.registerCommand(Commands.ENABLE_VERBOSE_LOGS, () => enableVerboseLogs()));
  context.subscriptions.push(
    VSCode.commands.registerCommand(Commands.ANALYSE_OPEN_FILE, () => {
      IssueService.instance.analyseOpenFileIgnoringExcludes(true);
      VSCode.commands.executeCommand('SonarQube.Findings.focus');
    })
  );

  context.subscriptions.push(VSCode.commands.registerCommand(Commands.FOCUS_ON_CONNECTION, async (connectionType: ConnectionType, connectionId?: string) => {
      const connectionsOfType = await allConnectionsTreeDataProvider.getConnections(connectionType)
      // find connection with ID, or focus on the first one of given type
      const targetConnection = connectionsOfType.find(c => c.id === connectionId) ?? connectionsOfType[0];
      allConnectionsView.reveal(targetConnection, {select: true, focus: true, expand: false});
  }));

  context.subscriptions.push(VSCode.commands.registerCommand(Commands.SHOW_FLIGHT_RECORDING_MENU, () => FlightRecorderService.instance.showFlightRecordingMenu()));
  context.subscriptions.push(VSCode.commands.registerCommand(Commands.COPY_FLIGHT_RECORDER_SESSION_ID, () => FlightRecorderService.instance.copySessionIdToClipboard()));
  context.subscriptions.push(VSCode.commands.registerCommand(Commands.DUMP_BACKEND_THREADS, () => {
    languageClient.dumpThreads();
  }));

  context.subscriptions.push(
    VSCode.commands.registerCommand(Commands.CONFIGURE_MCP_SERVER, (connection) => {
      configureMCPServer(languageClient, allConnectionsTreeDataProvider, connection);
      aiAgentsConfigurationTreeDataProvider.refresh();
    })
  );

  context.subscriptions.push(
    VSCode.commands.registerCommand(Commands.OPEN_MCP_SERVER_CONFIGURATION, () => openMCPServerConfigurationFile())
  );

  context.subscriptions.push(
    VSCode.commands.registerCommand(Commands.REFRESH_AI_AGENTS_CONFIGURATION, () => aiAgentsConfigurationTreeDataProvider.refresh())
  );

  context.subscriptions.push(
    VSCode.commands.registerCommand(Commands.OPEN_AIAGENTS_CONFIGURATION_DOC, () => {
      VSCode.commands.executeCommand(Commands.TRIGGER_HELP_AND_FEEDBACK_LINK, 'aiAgentsConfigurationDoc');
    })
  );

  context.subscriptions.push(
    VSCode.commands.registerCommand(Commands.OPEN_SONARQUBE_RULES_FILE, () => openSonarQubeRulesFile()),
    VSCode.commands.registerCommand(Commands.INTRODUCE_SONARQUBE_RULES_FILE, () => introduceSonarQubeRulesFile(languageClient))
  );
}

async function scanFolderForHotspotsCommandHandler(folderUri: VSCode.Uri) {
  await useProvidedFolderOrPickManuallyAndScan(
    folderUri,
    VSCode.workspace.workspaceFolders,
    languageClient,
    getFilesForHotspotsAndLaunchScan
  );
}

function initializeLanguageModelTools(context: VSCode.ExtensionContext) {
  if (VSCode.lm) {
    context.subscriptions.push(VSCode.lm.registerTool(ListPotentialSecurityIssuesTool.toolName, new ListPotentialSecurityIssuesTool(languageClient)));
    context.subscriptions.push(VSCode.lm.registerTool(ExcludeFileOrFolderTool.toolName, new ExcludeFileOrFolderTool(languageClient)));
    context.subscriptions.push(VSCode.lm.registerTool(SetUpConnectedModeTool.toolName, new SetUpConnectedModeTool(context, languageClient)));
    context.subscriptions.push(VSCode.lm.registerTool(AnalyzeFileTool.toolName, new AnalyzeFileTool(languageClient)));
  } else {
    logToSonarLintOutput('Language model tools are not available in this version of VSCode. Initializing extension without them.');
  }
}

function installCustomRequestHandlers(context: VSCode.ExtensionContext) {
  languageClient.onNotification(ExtendedClient.ShowFixSuggestion.type, params => FixSuggestionService.instance.showFixSuggestion(params))
  languageClient.onNotification(ExtendedClient.ShowRuleDescriptionNotification.type, showRuleDescription(context));
  languageClient.onNotification(ExtendedClient.SuggestBindingNotification.type, params => suggestBinding(params));
  languageClient.onRequest(ExtendedClient.ListFilesInFolderRequest.type, async (params) => {
    await FileSystemServiceImpl.instance.crawlDirectory(VSCode.Uri.parse(params.folderUri));
    return AutoBindingService.instance.listAutobindingFilesInFolder(params);
  }
  );
  languageClient.onRequest(ExtendedClient.GetTokenForServer.type, serverId => getTokenForServer(serverId));

  languageClient.onRequest(ExtendedClient.GetJavaConfigRequest.type, fileUri => getJavaConfig(languageClient, fileUri));
  languageClient.onRequest(ExtendedClient.ScmCheckRequest.type, fileUri => isIgnoredByScm(fileUri));
  languageClient.onRequest(ExtendedClient.ShouldAnalyseFileCheck.type, params => shouldAnalyseFile(params.uri));
  languageClient.onRequest(ExtendedClient.FilterOutExcludedFiles.type, params =>
    filterOutFilesIgnoredForAnalysis(params.fileUris)
  );
  languageClient.onRequest(ExtendedClient.CanShowMissingRequirementNotification.type, () => {
    return context.globalState.get(CAN_SHOW_MISSING_REQUIREMENT_NOTIF, true);
  });
  languageClient.onNotification(ExtendedClient.DoNotShowMissingRequirementsMessageAgain.type, () => {
    context.globalState.update(CAN_SHOW_MISSING_REQUIREMENT_NOTIF, false);
  })
  languageClient.onNotification(ExtendedClient.MaybeShowWiderLanguageSupportNotification.type, (language) => maybeShowWiderLanguageSupportNotification(context, language));
  languageClient.onNotification(ExtendedClient.RemoveBindingsForDeletedConnections.type, async (connectionIds) => {
    await BindingService.instance.removeBindingsForRemovedConnections(connectionIds);
  });
  languageClient.onNotification(ExtendedClient.ReportConnectionCheckResult.type, checkResult => {
    ConnectionSettingsService.instance.reportConnectionCheckResult(checkResult);
    allConnectionsTreeDataProvider.reportConnectionCheckResult(checkResult);
  });
  languageClient.onNotification(ExtendedClient.ShowNotificationForFirstSecretsIssueNotification.type, () =>
    showNotificationForFirstSecretsIssue(context)
  );
  languageClient.onNotification(ExtendedClient.ShowSonarLintOutputNotification.type, () =>
    VSCode.commands.executeCommand(Commands.SHOW_SONARLINT_OUTPUT)
  );
  languageClient.onNotification(ExtendedClient.OpenJavaHomeSettingsNotification.type, () =>
    VSCode.commands.executeCommand(Commands.OPEN_SETTINGS, JAVA_HOME_CONFIG)
  );
  languageClient.onNotification(ExtendedClient.OpenPathToNodeSettingsNotification.type, () =>
    VSCode.commands.executeCommand(Commands.OPEN_SETTINGS, 'sonarlint.pathToNodeExecutable')
  );
  languageClient.onNotification(ExtendedClient.BrowseToNotification.type, browseTo =>
    VSCode.commands.executeCommand(Commands.OPEN_BROWSER, VSCode.Uri.parse(browseTo))
  );
  languageClient.onNotification(ExtendedClient.OpenConnectionSettingsNotification.type, isSonarCloud => {
    const targetSection = `sonarlint.connectedMode.connections.${isSonarCloud ? 'sonarcloud' : 'sonarqube'}`;
    return VSCode.commands.executeCommand(Commands.OPEN_SETTINGS, targetSection);
  });
  languageClient.onNotification(ExtendedClient.ShowHotspotNotification.type, h =>
    showSecurityHotspot(findingsView, findingsTreeDataProvider, h)
  );
  languageClient.onNotification(ExtendedClient.ShowIssueOrHotspotNotification.type, showAllLocations);
  languageClient.onNotification(ExtendedClient.NeedCompilationDatabaseRequest.type, notifyMissingCompileCommands(context));
  languageClient.onRequest(ExtendedClient.GetTokenForServer.type, serverId => getTokenForServer(serverId));
  languageClient.onNotification(ExtendedClient.PublishHotspotsForFile.type, async hotspotsPerFile => {
    findingsTreeDataProvider.updateHotspots(hotspotsPerFile);
  });
  languageClient.onNotification(ExtendedClient.PublishTaintVulnerabilitiesForFile.type, async taintVulnerabilitiesPerFile => {
    findingsTreeDataProvider.updateTaintVulnerabilities(taintVulnerabilitiesPerFile.uri, taintVulnerabilitiesPerFile.diagnostics);
    TaintVulnerabilityDecorator.instance.updateTaintVulnerabilityDecorationsForFile(VSCode.Uri.parse(taintVulnerabilitiesPerFile.uri));
  });
  languageClient.onNotification(ExtendedClient.NotifyInvalidToken.type, async params => {
    await handleInvalidTokenNotification(params.connectionId);
  });

  languageClient.onNotification(ExtendedClient.PublishDependencyRisksForFolder.type, async dependencyRisksPerFolder => {
    findingsTreeDataProvider.updateDependencyRisks(dependencyRisksPerFolder);
  });

  languageClient.onRequest(
    ExtendedClient.AssistBinding.type,
    async params => await BindingService.instance.assistBinding(params)
  );
  languageClient.onRequest(ExtendedClient.SslCertificateConfirmation.type, cert =>
    showSslCertificateConfirmationDialog(cert)
  );
  languageClient.onRequest(ExtendedClient.AssistCreatingConnection.type, assistCreatingConnection(context));
  languageClient.onNotification(ExtendedClient.ShowSoonUnsupportedVersionMessage.type, params =>
    showSoonUnsupportedVersionMessage(params, context.workspaceState)
  );
  languageClient.onNotification(ExtendedClient.SubmitNewCodeDefinition.type, newCodeDefinitionForFolderUri => {
    NewCodeDefinitionService.instance.updateNewCodeDefinitionForFolderUri(newCodeDefinitionForFolderUri);
  });
  languageClient.onNotification(ExtendedClient.SuggestConnection.type, (params) => SharedConnectedModeSettingsService.instance.handleSuggestConnectionNotification(params.suggestionsByConfigScopeId));
  languageClient.onRequest(ExtendedClient.IsOpenInEditor.type, fileUri => {
    return VSCode.workspace.textDocuments.some(doc => code2ProtocolConverter(doc.uri) === fileUri);
  });
  languageClient.onNotification(ExtendedClient.FlightRecorderStartedNotification.type, (params) => {
    FlightRecorderService.instance.onFlightRecorderStarted(params.sessionId);
  });
  languageClient.onNotification(ExtendedClient.EmbeddedServerStartedNotification.type, (params) => {
    onEmbeddedServerStarted(params.port);
  });
}

function updateFindingsViewContainerBadge() {
  const totalCount = findingsTreeDataProvider.getTotalFindingsCount();
  const filteredCount = findingsTreeDataProvider.getFilteredFindingsCount();
  const activeFilter = findingsTreeDataProvider.getActiveFilter();
  
  if (totalCount > 0) { 
    const badgeValue = activeFilter === FilterType.All ? totalCount : filteredCount;
    const filterDisplayName = getFilterDisplayName(activeFilter);
    
    findingsView.badge = {
      value: badgeValue,
      tooltip: `${filterDisplayName}: ${filteredCount} of ${totalCount}`
    };
    
    findingsView.title = `SonarQube Findings (${filterDisplayName})`;
  } else {
    findingsView.badge = undefined;
    findingsView.title = 'SonarQube Findings';
  }
}

async function getTokenForServer(serverId: string): Promise<string> {
  // serverId is either a server URL or a organizationKey prefixed with region (EU_ or US_)
  return ConnectionSettingsService.instance.getServerToken(serverId);
}

async function showAllLocations(issue: ExtendedClient.Issue) {
  await secondaryLocationsTree.showAllLocations(issue);
  if (issue.creationDate) {
    const createdAgo = issue.creationDate
      ? DateTime.fromISO(issue.creationDate).toLocaleString(DateTime.DATETIME_MED)
      : null;
    issueLocationsView.message = createdAgo
      ? `Analyzed ${createdAgo} on '${issue.connectionId}'`
      : `Detected by SonarQube for VS Code`;
  } else {
    issueLocationsView.message = null;
  }
  if (issue.flows.length > 0) {
    // make sure the view is visible
    ContextManager.instance.setIssueLocationsContext();
    issueLocationsView.reveal(secondaryLocationsTree.getChildren(null)[0]);
  }
}

function clearLocations() {
  secondaryLocationsTree.hideLocations();
  issueLocationsView.message = null;
}

export function deactivate(): Thenable<void> {
  if (!languageClient) {
    return undefined;
  }
  ContextManager.instance.resetAllContexts();
  return languageClient.stop();
}
