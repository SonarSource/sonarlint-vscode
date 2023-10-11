/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
import * as ChildProcess from 'child_process';
import { DateTime } from 'luxon';
import * as Path from 'path';
import * as VSCode from 'vscode';
import { StatusBarAlignment } from 'vscode';
import { LanguageClientOptions, StreamInfo } from 'vscode-languageclient/node';
import { configureCompilationDatabase, notifyMissingCompileCommands } from './cfamily/cfamily';
import { AutoBindingService } from './connected/autobinding';
import { BindingService, showSoonUnsupportedVersionMessage } from './connected/binding';
import { AllConnectionsTreeDataProvider } from './connected/connections';
import {
  assistCreatingConnection,
  connectToSonarCloud,
  connectToSonarQube,
  editSonarCloudConnection,
  editSonarQubeConnection
} from './connected/connectionsetup';
import {
  getHelpAndFeedbackItemById,
  HelpAndFeedbackLink,
  HelpAndFeedbackTreeDataProvider
} from './help/helpAndFeedbackTreeDataProvider';
import {
  changeHotspotStatus,
  getFilesForHotspotsAndLaunchScan,
  hideSecurityHotspot,
  HOTSPOTS_VIEW_ID,
  showHotspotDescription,
  showHotspotDetails,
  showSecurityHotspot,
  useProvidedFolderOrPickManuallyAndScan
} from './hotspot/hotspots';
import { AllHotspotsTreeDataProvider, HotspotNode, HotspotTreeViewItem } from './hotspot/hotspotsTreeDataProvider';
import { getJavaConfig, installClasspathListener } from './java/java';
import { LocationTreeItem, navigateToLocation, SecondaryLocationsTree } from './location/locations';
import { SonarLintExtendedLanguageClient } from './lsp/client';
import * as protocol from './lsp/protocol';
import { languageServerCommand } from './lsp/server';
import { showRuleDescription } from './rules/rulepanel';
import { AllRulesTreeDataProvider, LanguageNode, RuleNode } from './rules/rules';
import { initScm, isIgnoredByScm } from './scm/scm';
import { isFirstSecretDetected, showNotificationForFirstSecretsIssue } from './secrets/secrets';
import { ConnectionSettingsService, migrateConnectedModeSettings } from './settings/connectionsettings';
import {
  enableVerboseLogs,
  getCurrentConfiguration,
  getSonarLintConfiguration,
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
import { showSslCertificateConfirmationDialog } from './util/showMessage';
import { NewCodeDefinitionService } from './newcode/newCodeDefinitionService';
import { ShowIssueNotification } from './lsp/protocol';

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
let allConnectionsTreeDataProvider: AllConnectionsTreeDataProvider;
let hotspotsTreeDataProvider: AllHotspotsTreeDataProvider;
let allHotspotsView: VSCode.TreeView<HotspotTreeViewItem>;
let helpAndFeedbackTreeDataProvider: HelpAndFeedbackTreeDataProvider;
let helpAndFeedbackView: VSCode.TreeView<HelpAndFeedbackLink>;

function runJavaServer(context: VSCode.ExtensionContext): Promise<StreamInfo> {
  return resolveRequirements(context)
    .catch(error => {
      //show error
      VSCode.window.showErrorMessage(error.message, error.label).then(selection => {
        if (error.label && error.label === selection && error.command) {
          VSCode.commands.executeCommand(error.command, error.commandParam);
        }
      });
      // rethrow to disrupt the chain.
      throw error;
    })
    .then(requirements => {
      return new Promise<StreamInfo>((resolve, reject) => {
        const { command, args } = languageServerCommand(context, requirements);
        logToSonarLintOutput(`Executing ${command} ${args.join(' ')}`);
        const process = ChildProcess.spawn(command, args);

        process.stderr.on('data', function (data) {
          logWithPrefix(data, '[stderr]');
        });

        resolve({
          reader: process.stdout,
          writer: process.stdin
        });
      });
    });
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
  if (pathName[0] !== '/') {
    pathName = '/' + pathName;
  }

  return encodeURI('file://' + pathName);
}

function toggleRule(level: protocol.ConfigLevel) {
  return (ruleKey: string | RuleNode) => {
    const configuration = getSonarLintConfiguration();
    const rules = configuration.get('rules') || {};

    if (typeof ruleKey === 'string') {
      // This is when a rule is deactivated from a code action, and we only have the key, not the default activation.
      // So level should be "off" regardless of the default activation.
      rules[ruleKey] = { level };
    } else {
      // When a rule is toggled from the list of rules, we can be smarter!
      const { key, activeByDefault } = ruleKey.rule;
      if ((level === 'on' && !activeByDefault) || (level === 'off' && activeByDefault)) {
        // Override default
        rules[key] = { level };
      } else {
        // Back to default
        rules[key] = undefined;
      }
    }
    return configuration.update('rules', rules, VSCode.ConfigurationTarget.Global);
  };
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

  const serverOptions = () => runJavaServer(context);

  const pythonWatcher = VSCode.workspace.createFileSystemWatcher('**/*.py');
  context.subscriptions.push(pythonWatcher);

  // Options to control the language client
  const clientOptions: LanguageClientOptions = {
    documentSelector: DOCUMENT_SELECTOR,
    synchronize: {
      configurationSection: 'sonarlint',
      fileEvents: pythonWatcher
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
        productVersion: util.packageJson.version,
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
          }
        },
        enableNotebooks: true
      };
    },
    outputChannel: getLogOutput(),
    revealOutputChannelOn: 4 // never
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
  BindingService.init(languageClient, context.workspaceState, ConnectionSettingsService.instance);
  AutoBindingService.init(BindingService.instance, context.workspaceState, ConnectionSettingsService.instance);
  NewCodeDefinitionService.init(context);
  migrateConnectedModeSettings(getCurrentConfiguration(), ConnectionSettingsService.instance).catch(e => {
    /* ignored */
  });

  installCustomRequestHandlers(context);

  const referenceBranchStatusItem = VSCode.window.createStatusBarItem(StatusBarAlignment.Left, 1);
  const scm = await initScm(languageClient, referenceBranchStatusItem);
  context.subscriptions.push(scm);
  context.subscriptions.push(
    languageClient.onRequest(protocol.GetBranchNameForFolderRequest.type, folderUri => {
      return scm.getBranchForFolder(VSCode.Uri.parse(folderUri));
    })
  );
  context.subscriptions.push(
    languageClient.onNotification(protocol.SetReferenceBranchNameForFolderNotification.type, params => {
      scm.setReferenceBranchName(VSCode.Uri.parse(params.folderUri), params.branchName);
    })
  );
  context.subscriptions.push(referenceBranchStatusItem);
  VSCode.window.onDidChangeActiveTextEditor(e => {
    scm.updateReferenceBranchStatusItem(e);
    NewCodeDefinitionService.instance.updateNewCodeStatusBarItem(e);
  });

  allRulesTreeDataProvider = new AllRulesTreeDataProvider(() => languageClient.listAllRules());
  allRulesView = VSCode.window.createTreeView('SonarLint.AllRules', {
    treeDataProvider: allRulesTreeDataProvider
  });
  context.subscriptions.push(allRulesView);

  secondaryLocationsTree = new SecondaryLocationsTree();
  issueLocationsView = VSCode.window.createTreeView('SonarLint.IssueLocations', {
    treeDataProvider: secondaryLocationsTree
  });
  context.subscriptions.push(issueLocationsView);

  IssueService.init(languageClient, secondaryLocationsTree, issueLocationsView);

  context.subscriptions.push(languageClient.onNotification(ShowIssueNotification.type, IssueService.showIssue));

  VSCode.workspace.onDidChangeConfiguration(async event => {
    if (event.affectsConfiguration('sonarlint.rules')) {
      allRulesTreeDataProvider.refresh();
    }
    if (event.affectsConfiguration('sonarlint.connectedMode')) {
      allConnectionsTreeDataProvider.refresh();
    }
    if (event.affectsConfiguration('sonarlint.focusOnNewCode')) {
      NewCodeDefinitionService.instance.updateFocusOnNewCodeState();
    }
  });

  registerCommands(context);

  allConnectionsTreeDataProvider = new AllConnectionsTreeDataProvider(languageClient);

  const allConnectionsView = VSCode.window.createTreeView('SonarLint.ConnectedMode', {
    treeDataProvider: allConnectionsTreeDataProvider
  });
  context.subscriptions.push(allConnectionsView);

  hotspotsTreeDataProvider = new AllHotspotsTreeDataProvider(ConnectionSettingsService.instance);
  allHotspotsView = VSCode.window.createTreeView(HOTSPOTS_VIEW_ID, {
    treeDataProvider: hotspotsTreeDataProvider
  });

  context.subscriptions.push(allHotspotsView);

  helpAndFeedbackTreeDataProvider = new HelpAndFeedbackTreeDataProvider();
  helpAndFeedbackView = VSCode.window.createTreeView('SonarLint.HelpAndFeedback', {
    treeDataProvider: helpAndFeedbackTreeDataProvider
  });
  context.subscriptions.push(helpAndFeedbackView);

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
    if (remoteName.indexOf(`${res}`) === 0) {
      ret = res;
    }
  });

  return ret;
}

function suggestBinding(params: protocol.SuggestBindingParams) {
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
      languageClient.showHotspotRuleDescription(hotspot.ruleKey, hotspot.key, hotspot.fileUri)
    )
  );

  context.subscriptions.push(
    VSCode.commands.registerCommand(Commands.SHOW_HOTSPOT_DETAILS, async hotspot => {
      const hotspotDetails = await languageClient.getHotspotDetails(hotspot.ruleKey, hotspot.key, hotspot.fileUri);
      showHotspotDetails(hotspotDetails, hotspot);
    })
  );

  context.subscriptions.push(
    VSCode.commands.registerCommand(Commands.OPEN_HOTSPOT_ON_SERVER, hotspot =>
      languageClient.openHotspotOnServer(hotspot.key, hotspot.fileUri)
    )
  );

  context.subscriptions.push(
    VSCode.commands.registerCommand(Commands.SHOW_HOTSPOT_LOCATION, (hotspot: HotspotNode) =>
      languageClient.showHotspotLocations(hotspot.key, hotspot.fileUri)
    )
  );

  context.subscriptions.push(
    VSCode.commands.registerCommand(Commands.HIGHLIGHT_REMOTE_HOTSPOT_LOCATION, (hotspot: HotspotNode) =>
      showSecurityHotspot(allHotspotsView, hotspotsTreeDataProvider)
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
      await allRulesView.reveal(new RuleNode({ key: ruleKey.toUpperCase() } as protocol.Rule), {
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
      await VSCode.commands.executeCommand(Commands.OPEN_RULE_BY_KEY, key);
    })
  );
  context.subscriptions.push(VSCode.commands.registerCommand(Commands.SHOW_SONARLINT_OUTPUT, () => showLogOutput()));

  context.subscriptions.push(VSCode.commands.registerCommand(Commands.INSTALL_MANAGED_JRE, installManagedJre));

  context.subscriptions.push(
    VSCode.commands.registerCommand(Commands.HIDE_HOTSPOT, () => {
      hideSecurityHotspot(hotspotsTreeDataProvider);
      updateSonarLintViewContainerBadge();
    })
  );
  context.subscriptions.push(
    VSCode.commands.registerCommand(Commands.SHOW_HOTSPOT_DESCRIPTION, showHotspotDescription)
  );

  context.subscriptions.push(
    VSCode.commands.registerCommand(Commands.CONFIGURE_COMPILATION_DATABASE, configureCompilationDatabase)
  );

  context.subscriptions.push(
    VSCode.commands.registerCommand(Commands.CONNECT_TO_SONARQUBE, connectToSonarQube(context))
  );
  context.subscriptions.push(
    VSCode.commands.registerCommand(Commands.CONNECT_TO_SONARCLOUD, connectToSonarCloud(context))
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
      (workspaceUri: string, issueKey: string, fileUri: string, isTaintIssue: boolean) =>
        resolveIssueMultiStepInput(workspaceUri, issueKey, fileUri, isTaintIssue)
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
    VSCode.commands.registerCommand(Commands.REMOVE_PROJECT_BINDING, binding =>
      BindingService.instance.deleteBindingWithConfirmation(binding)
    )
  );

  context.subscriptions.push(
    VSCode.commands.registerCommand(Commands.TRIGGER_HELP_AND_FEEDBACK_LINK, helpAndFeedbackItem => {
      if (!helpAndFeedbackItem) {
        helpAndFeedbackItem = getHelpAndFeedbackItemById('getHelp');
      }
      languageClient.helpAndFeedbackLinkClicked(helpAndFeedbackItem.id);
      VSCode.commands.executeCommand(Commands.OPEN_BROWSER, VSCode.Uri.parse(helpAndFeedbackItem.url));
    })
  );

  context.subscriptions.push(
    VSCode.commands.registerCommand(Commands.SCAN_FOR_HOTSPOTS_IN_FOLDER, async folder => {
      await hotspotsTreeDataProvider.showHotspotsInFolder();
      await scanFolderForHotspotsCommandHandler(folder);
    })
  );
  context.subscriptions.push(
    VSCode.commands.registerCommand(Commands.SHOW_HOTSPOTS_IN_OPEN_FILES, async () => {
      await hotspotsTreeDataProvider.showHotspotsInOpenFiles();
      languageClient.forgetFolderHotspots();
    })
  );

  context.subscriptions.push(
    VSCode.commands.registerCommand(Commands.FORGET_FOLDER_HOTSPOTS, () => languageClient.forgetFolderHotspots())
  );

  context.subscriptions.push(VSCode.commands.registerCommand(Commands.ENABLE_VERBOSE_LOGS, () => enableVerboseLogs()));
  context.subscriptions.push(
    VSCode.commands.registerCommand(Commands.ANALYSE_OPEN_FILE, () =>
      IssueService.instance.analyseOpenFileIgnoringExcludes()
    )
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

function installCustomRequestHandlers(context: VSCode.ExtensionContext) {
  languageClient.onNotification(protocol.ShowRuleDescriptionNotification.type, showRuleDescription(context));
  languageClient.onNotification(protocol.SuggestBindingNotification.type, params => suggestBinding(params));
  languageClient.onRequest(protocol.FindFileByNamesInFolderRequest.type, params =>
    AutoBindingService.instance.findFileByNameInFolderRequest(params)
  );
  languageClient.onRequest(protocol.GetTokenForServer.type, serverId => getTokenForServer(serverId));

  languageClient.onRequest(protocol.GetJavaConfigRequest.type, fileUri => getJavaConfig(languageClient, fileUri));
  languageClient.onRequest(protocol.ScmCheckRequest.type, fileUri => isIgnoredByScm(fileUri));
  languageClient.onRequest(protocol.ShouldAnalyseFileCheck.type, params => shouldAnalyseFile(params.uri));
  languageClient.onRequest(protocol.FilterOutExcludedFiles.type, params =>
    filterOutFilesIgnoredForAnalysis(params.fileUris)
  );
  languageClient.onNotification(protocol.ReportConnectionCheckResult.type, checkResult => {
    ConnectionSettingsService.instance.reportConnectionCheckResult(checkResult);
    allConnectionsTreeDataProvider.reportConnectionCheckResult(checkResult);
  });
  languageClient.onNotification(protocol.ShowNotificationForFirstSecretsIssueNotification.type, () =>
    showNotificationForFirstSecretsIssue(context)
  );
  languageClient.onNotification(protocol.ShowSonarLintOutputNotification.type, () =>
    VSCode.commands.executeCommand(Commands.SHOW_SONARLINT_OUTPUT)
  );
  languageClient.onNotification(protocol.OpenJavaHomeSettingsNotification.type, () =>
    VSCode.commands.executeCommand(Commands.OPEN_SETTINGS, JAVA_HOME_CONFIG)
  );
  languageClient.onNotification(protocol.OpenPathToNodeSettingsNotification.type, () =>
    VSCode.commands.executeCommand(Commands.OPEN_SETTINGS, 'sonarlint.pathToNodeExecutable')
  );
  languageClient.onNotification(protocol.BrowseToNotification.type, browseTo =>
    VSCode.commands.executeCommand(Commands.OPEN_BROWSER, VSCode.Uri.parse(browseTo))
  );
  languageClient.onNotification(protocol.OpenConnectionSettingsNotification.type, isSonarCloud => {
    const targetSection = `sonarlint.connectedMode.connections.${isSonarCloud ? 'sonarcloud' : 'sonarqube'}`;
    return VSCode.commands.executeCommand(Commands.OPEN_SETTINGS, targetSection);
  });
  languageClient.onNotification(protocol.ShowHotspotNotification.type, h =>
    showSecurityHotspot(allHotspotsView, hotspotsTreeDataProvider, h)
  );
  languageClient.onNotification(protocol.ShowIssueOrHotspotNotification.type, showAllLocations);
  languageClient.onNotification(protocol.NeedCompilationDatabaseRequest.type, notifyMissingCompileCommands(context));
  languageClient.onRequest(protocol.GetTokenForServer.type, serverId => getTokenForServer(serverId));
  languageClient.onNotification(protocol.PublishHotspotsForFile.type, hotspotsPerFile => {
    hotspotsTreeDataProvider.refresh(hotspotsPerFile);
    updateSonarLintViewContainerBadge();
  });
  languageClient.onNotification(protocol.AssistCreatingConnection.type, assistCreatingConnection(context));
  languageClient.onNotification(
    protocol.AssistBinding.type,
    async params => await BindingService.instance.assistBinding(params)
  );
  languageClient.onRequest(protocol.SslCertificateConfirmation.type, cert =>
    showSslCertificateConfirmationDialog(cert)
  );
  languageClient.onNotification(protocol.ShowSoonUnsupportedVersionMessage.type, params =>
    showSoonUnsupportedVersionMessage(params, context.workspaceState)
  );
  languageClient.onNotification(protocol.SubmitNewCodeDefinition.type, newCodeDefinitionForFolderUri => {
    NewCodeDefinitionService.instance.updateNewCodeDefinitionForFolderUri(newCodeDefinitionForFolderUri);
  });
}

function updateSonarLintViewContainerBadge() {
  const allHotspotsCount = hotspotsTreeDataProvider.countAllHotspots();
  allHotspotsView.badge =
    allHotspotsCount > 0
      ? {
          value: allHotspotsCount,
          tooltip: `Total ${allHotspotsCount} Security Hotspots`
        }
      : undefined;
}

async function getTokenForServer(serverId: string): Promise<string> {
  return ConnectionSettingsService.instance.getServerToken(serverId);
}

async function showAllLocations(issue: protocol.Issue) {
  await secondaryLocationsTree.showAllLocations(issue);
  if (issue.creationDate) {
    const createdAgo = issue.creationDate
      ? DateTime.fromISO(issue.creationDate).toLocaleString(DateTime.DATETIME_MED)
      : null;
    issueLocationsView.message = createdAgo
      ? `Analyzed ${createdAgo} on '${issue.connectionId}'`
      : `Detected by SonarLint`;
  } else {
    issueLocationsView.message = null;
  }
  if (issue.flows.length > 0) {
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
  return languageClient.stop();
}
