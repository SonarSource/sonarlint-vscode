/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

// Must be kept at the top for Node instrumentation to work correctly
import { MonitoringService } from './monitoring/monitoring';
import { ProcessManager } from './monitoring/processManager';

import * as ChildProcess from 'node:child_process';
import * as Path from 'node:path';
import * as VSCode from 'vscode';
import { LanguageClientOptions, StreamInfo } from 'vscode-languageclient/node';
import { notifyMissingCompileCommands } from './cfamily/cfamily';
import { AutoBindingService } from './connected/autobinding';
import { assistCreatingConnection } from './connected/assistCreatingConnection';
import { BindingService, showSoonUnsupportedVersionMessage } from './connected/binding';
import { AllConnectionsTreeDataProvider, ConnectionsNode } from './connected/connections';
import {
  handleInvalidTokenNotification
} from './connected/connectionsetup';
import {
  HelpAndFeedbackLink,
  HelpAndFeedbackTreeDataProvider
} from './help/helpAndFeedbackTreeDataProvider';
import { AIAgentsConfigurationTreeDataProvider, AIAgentsConfigurationItem } from './aiAgentsConfiguration/aiAgentsConfigurationTreeDataProvider';
import {
  showSecurityHotspot,
} from './hotspot/hotspots';
import { FindingsTreeDataProvider, FindingsTreeViewItem } from './findings/findingsTreeDataProvider';
import { FilterType, getFilterDisplayName } from './findings/findingsTreeDataProviderUtil';
import { getJavaConfig, installClasspathListener } from './java/java';
import { LocationTreeItem, SecondaryLocationsTree } from './location/locations';
import { SonarLintExtendedLanguageClient } from './lsp/client';
import { languageServerCommand } from './lsp/server';
import { showRuleDescription } from './rules/rulepanel';
import { AllRulesTreeDataProvider, LanguageNode, setRulesViewMessage } from './rules/rules';
import { initScm, isIgnoredByScm } from './scm/scm';
import { isFirstSecretDetected, showNotificationForFirstSecretsIssue } from './secrets/secrets';
import { ConnectionSettingsService, migrateConnectedModeSettings } from './settings/connectionsettings';
import {
  getCurrentConfiguration,
  isVerboseEnabled,
  loadInitialSettings,
  onConfigurationChange
} from './settings/settings';
import { Commands } from './util/commands';
import { CommandsManager } from './commandsManager';
import { getLogOutput, initLogOutput, logToSonarLintOutput } from './util/logging';
import { getPlatform } from './util/platform';
import { JAVA_HOME_CONFIG, resolveRequirements } from './util/requirements';
import { code2ProtocolConverter, protocol2CodeConverter } from './util/uri';
import * as util from './util/util';
import { filterOutFilesIgnoredForAnalysis, shouldAnalyseFile } from './util/util';
import { IssueService } from './issue/issue';
import { CAN_SHOW_MISSING_REQUIREMENT_NOTIF, showSslCertificateConfirmationDialog } from './util/showMessage';
import { NewCodeDefinitionService } from './newcode/newCodeDefinitionService';
import { ExtendedClient } from './lsp/protocol';
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
import { AutomaticAnalysisService } from './settings/automaticAnalysis';
import { onEmbeddedServerStarted } from './aiAgentsConfiguration/mcpServerConfig';
import { IdeLabsFlagManagementService } from './labs/ideLabsFlagManagementService';
import { LabsWebviewProvider } from './labs/labsWebviewProvider';
import { StatusBarService } from './statusbar/statusBar';
import { RemediationService } from './remediationPanel/remediationService';
import { RemediationWebviewProvider } from './remediationPanel/remediationWebviewProvider';

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
let remediationWebviewProvider: RemediationWebviewProvider;
const currentProgress: Record<string, { progress: VSCode.Progress<{ increment?: number }>, resolve: () => void } | undefined> = {};

async function runJavaServer(context: VSCode.ExtensionContext): Promise<StreamInfo> {
  try {
    const requirements = await resolveRequirements(context);
    const { command, args } = await languageServerCommand(context, requirements);
    logToSonarLintOutput(`Executing ${command} ${args.join(' ')}`);
    const process = ChildProcess.spawn(command, args);

    // Register process with ProcessManager for flight recorder diagnostics
    ProcessManager.instance.setLanguageServerProcess(process);

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
  StatusBarService.init(context);
  FileSystemServiceImpl.init();
  RemediationService.init();
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

  remediationWebviewProvider = new RemediationWebviewProvider(context);
  context.subscriptions.push(
    VSCode.window.registerWebviewViewProvider('SonarLint.RemediationPanel', remediationWebviewProvider)
  );

  installCustomRequestHandlers(context);
  initializeLanguageModelTools(context);

  const scm = await initScm(languageClient);
  context.subscriptions.push(scm);
  context.subscriptions.push(
    languageClient.onNotification(ExtendedClient.SetReferenceBranchNameForFolderNotification.type, params => {
      scm.setReferenceBranchName(VSCode.Uri.parse(params.folderUri), params.branchName);
    })
  );

  VSCode.window.onDidChangeActiveTextEditor(e => {
    const currentBranch = scm.getReferenceBranchNameForFile(e?.document?.uri);
    StatusBarService.instance.updateReferenceBranch(currentBranch);
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

  context.subscriptions.push(
    languageClient.onNotification(ExtendedClient.ShowIssueNotification.type, async (issue) => {
      await IssueService.showIssue(issue);
      RemediationService.instance.trackIssueEvent(issue);
    })
  );

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

  const automaticAnalysisService = new AutomaticAnalysisService(findingsView);
  automaticAnalysisService.updateAutomaticAnalysisStatusBarAndFindingsViewMessage();

  const initialBranch = scm.getReferenceBranchNameForFile(VSCode.window.activeTextEditor?.document?.uri);
  StatusBarService.instance.updateReferenceBranch(initialBranch);
  NewCodeDefinitionService.instance.updateFocusOnNewCodeState();

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


  aiAgentsConfigurationTreeDataProvider = new AIAgentsConfigurationTreeDataProvider();
  aiAgentsConfigurationView = VSCode.window.createTreeView('SonarLint.AIAgentsConfiguration', {
    treeDataProvider: aiAgentsConfigurationTreeDataProvider
  });
  context.subscriptions.push(aiAgentsConfigurationView);

  allConnectionsTreeDataProvider = new AllConnectionsTreeDataProvider(languageClient);

  allConnectionsView = VSCode.window.createTreeView('SonarLint.ConnectedMode', {
    treeDataProvider: allConnectionsTreeDataProvider
  });
  context.subscriptions.push(allConnectionsView);

  const commandsManager = new CommandsManager(context, languageClient, allRulesTreeDataProvider, allRulesView, allConnectionsTreeDataProvider, allConnectionsView, aiAgentsConfigurationTreeDataProvider);
  commandsManager.registerCommands();
  
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

  const labsWebviewProvider = new LabsWebviewProvider(context, languageClient);
  context.subscriptions.push(
    VSCode.window.registerWebviewViewProvider('SonarQube.Labs', labsWebviewProvider)
  );

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
  languageClient.onNotification(ExtendedClient.ShowFixSuggestion.type, params => {
    RemediationService.instance.trackFixSuggestionEvent(params);
  })
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
    return context.globalState.get(CAN_SHOW_MISSING_REQUIREMENT_NOTIF, true) ? ExtendedClient.CanShowMissingRequirementNotificationResult.Full :
     ExtendedClient.CanShowMissingRequirementNotificationResult.DoNotShowAgain;
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
  languageClient.onNotification(ExtendedClient.ShowHotspotNotification.type, async h => {
    await showSecurityHotspot(findingsView, findingsTreeDataProvider, h);
    RemediationService.instance.trackHotspotEvent(h);
  });
  languageClient.onNotification(ExtendedClient.ShowIssueOrHotspotNotification.type, IssueService.showAllLocations);
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
  languageClient.onNotification(ExtendedClient.EmbeddedServerStartedNotification.type, (params) => {
    onEmbeddedServerStarted(params.port);
  });
  languageClient.onRequest(ExtendedClient.HasJoinedIdeLabs.type, () => {
    return IdeLabsFlagManagementService.instance.isIdeLabsJoined();
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


export function deactivate(): Thenable<void> {
  if (!languageClient) {
    return undefined;
  }
  ContextManager.instance.resetAllContexts();
  return languageClient.stop();
}
