/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2021 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
import * as ChildProcess from 'child_process';
import * as FS from 'fs';
import { DateTime } from 'luxon';
import * as Net from 'net';
import * as Path from 'path';
import * as VSCode from 'vscode';
import { LanguageClientOptions, StreamInfo } from 'vscode-languageclient/node';
import { SonarLintExtendedLanguageClient } from './client';
import { Commands } from './commands';
import {
  hideSecurityHotspot,
  HotspotsCodeActionProvider,
  hotspotsCollection,
  showHotspotDescription,
  showSecurityHotspot
} from './hotspots';
import { getJavaConfig, installClasspathListener } from './java';
import { LocationTreeItem, navigateToLocation, SecondaryLocationsTree } from './locations';
import * as protocol from './protocol';
import { installManagedJre, JAVA_HOME_CONFIG, RequirementsData, resolveRequirements } from './requirements';
import { computeRuleDescPanelContent } from './rulepanel';
import { AllRulesTreeDataProvider, ConfigLevel, Rule, RuleNode } from './rules';
import { code2ProtocolConverter, protocol2CodeConverter } from './uri';
import * as util from './util';

declare let v8debug: object;
const DEBUG = typeof v8debug === 'object' || util.startedInDebugMode(process);
let currentConfig: VSCode.WorkspaceConfiguration;

const DOCUMENT_SELECTOR = [
  { scheme: 'file', language: 'java' },
  { scheme: 'file', language: 'javascript' },
  { scheme: 'file', language: 'javascriptreact' },
  { scheme: 'file', language: 'php' },
  { scheme: 'file', language: 'python' },
  { scheme: 'file', language: 'typescript' },
  { scheme: 'file', language: 'typescriptreact' },
  { scheme: 'file', language: 'vue' },
  { scheme: 'file', language: 'html' },
  { scheme: 'file', language: 'jsp' },
  { scheme: 'file', language: 'apex' },
  { scheme: 'file', language: 'plsql' },
  { scheme: 'file', language: 'oraclesql' }
];

let sonarlintOutput: VSCode.OutputChannel;
let ruleDescriptionPanel: VSCode.WebviewPanel;
let secondaryLocationsTree: SecondaryLocationsTree;
let issueLocationsView: VSCode.TreeView<LocationTreeItem>;
let languageClient: SonarLintExtendedLanguageClient;

export function logToSonarLintOutput(message) {
  if (sonarlintOutput) {
    sonarlintOutput.appendLine(message);
  }
}

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
        const server = Net.createServer(socket => {
          if (isVerboseEnabled()) {
            logToSonarLintOutput(`Child process connected on port ${(server.address() as Net.AddressInfo).port}`);
          }
          resolve({
            reader: socket,
            writer: socket
          });
        });
        server.listen(0, () => {
          // Start the child java process
          const port = (server.address() as Net.AddressInfo).port;
          const { command, args } = languageServerCommand(context, requirements, port);
          if (isVerboseEnabled()) {
            logToSonarLintOutput(`Executing ${command} ${args.join(' ')}`);
          }
          const process = ChildProcess.spawn(command, args);

          process.stdout.on('data', function (data) {
            logWithPrefix(data, '[stdout]');
          });
          process.stderr.on('data', function (data) {
            logWithPrefix(data, '[stderr]');
          });
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

function isVerboseEnabled(): boolean {
  return currentConfig.get('output.showVerboseLogs', false);
}

function languageServerCommand(
  context: VSCode.ExtensionContext,
  requirements: RequirementsData,
  port: number
): { command: string; args: string[] } {
  const serverJar = Path.resolve(context.extensionPath, 'server', 'sonarlint-ls.jar');
  const javaExecutablePath = Path.resolve(requirements.javaHome + '/bin/java');

  const params = [];
  if (DEBUG) {
    params.push('-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=8000');
    params.push('-Dsonarlint.telemetry.disabled=true');
  }
  const vmargs = getSonarLintConfiguration().get('ls.vmargs', '');
  parseVMargs(params, vmargs);
  params.push('-jar', serverJar, `${port}`);
  params.push(toUrl(Path.resolve(context.extensionPath, 'analyzers', 'sonarjava.jar')));
  params.push(toUrl(Path.resolve(context.extensionPath, 'analyzers', 'sonarjs.jar')));
  params.push(toUrl(Path.resolve(context.extensionPath, 'analyzers', 'sonarphp.jar')));
  params.push(toUrl(Path.resolve(context.extensionPath, 'analyzers', 'sonarpython.jar')));
  params.push(toUrl(Path.resolve(context.extensionPath, 'analyzers', 'sonarhtml.jar')));
  return { command: javaExecutablePath, args: params };
}

export function toUrl(filePath: string) {
  let pathName = Path.resolve(filePath).replace(/\\/g, '/');

  // Windows drive letter must be prefixed with a slash
  if (pathName[0] !== '/') {
    pathName = '/' + pathName;
  }

  return encodeURI('file://' + pathName);
}

function resolveInAnyWorkspaceFolder(tsdkPathSetting) {
  if (Path.isAbsolute(tsdkPathSetting)) {
    return FS.existsSync(tsdkPathSetting) ? tsdkPathSetting : undefined;
  }
  for (const folder of VSCode.workspace.workspaceFolders || []) {
    const configuredTsPath = Path.join(folder.uri.fsPath, tsdkPathSetting);
    if (FS.existsSync(configuredTsPath)) {
      return configuredTsPath;
    }
  }
  return undefined;
}

function findTypeScriptLocation(): string | undefined {
  const tsExt = VSCode.extensions.getExtension('vscode.typescript-language-features');
  if (tsExt) {
    const bundledTypeScriptPath = Path.resolve(tsExt.extensionPath, '..', 'node_modules', 'typescript', 'lib');
    if (!FS.existsSync(bundledTypeScriptPath)) {
      logToSonarLintOutput(
        `Unable to locate bundled TypeScript module in "${bundledTypeScriptPath}". Please report this error to SonarLint project.`
      );
    }
    const tsdkPathSetting = VSCode.workspace.getConfiguration('typescript').get('tsdk');

    if (tsdkPathSetting) {
      const configuredTsPath = resolveInAnyWorkspaceFolder(tsdkPathSetting);
      if (configuredTsPath !== undefined) {
        return configuredTsPath;
      }
      logToSonarLintOutput(
        `Unable to locate TypeScript module in "${configuredTsPath}". Falling back to the VSCode's one at "${bundledTypeScriptPath}"`
      );
    }
    return bundledTypeScriptPath;
  } else {
    logToSonarLintOutput('Unable to locate TypeScript extension. TypeScript support in SonarLint might not work.');
    return undefined;
  }
}

function toggleRule(level: ConfigLevel) {
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

export function activate(context: VSCode.ExtensionContext) {
  currentConfig = getSonarLintConfiguration();

  util.setExtensionContext(context);
  sonarlintOutput = VSCode.window.createOutputChannel('SonarLint');
  context.subscriptions.push(sonarlintOutput);

  const serverOptions = () => runJavaServer(context);

  const tsPath = findTypeScriptLocation();

  // Options to control the language client
  const clientOptions: LanguageClientOptions = {
    documentSelector: DOCUMENT_SELECTOR,
    synchronize: {
      configurationSection: 'sonarlint'
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
        appName: VSCode.env.appName,
        workspaceName: VSCode.workspace.name,
        typeScriptLocation: tsPath ? Path.dirname(Path.dirname(tsPath)) : undefined
      };
    },
    outputChannel: sonarlintOutput,
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

  languageClient.onReady().then(() => installCustomRequestHandlers(context));

  const allRulesTreeDataProvider = new AllRulesTreeDataProvider(() =>
    languageClient.onReady().then(() => languageClient.listAllRules())
  );
  const allRulesView = VSCode.window.createTreeView('SonarLint.AllRules', {
    treeDataProvider: allRulesTreeDataProvider
  });
  context.subscriptions.push(allRulesView);

  secondaryLocationsTree = new SecondaryLocationsTree();
  issueLocationsView = VSCode.window.createTreeView('SonarLint.IssueLocations', {
    treeDataProvider: secondaryLocationsTree
  });
  context.subscriptions.push(issueLocationsView);
  context.subscriptions.push(VSCode.commands.registerCommand(Commands.SHOW_ALL_LOCATIONS, showAllLocations));
  context.subscriptions.push(VSCode.commands.registerCommand(Commands.CLEAR_LOCATIONS, clearLocations));
  context.subscriptions.push(VSCode.commands.registerCommand(Commands.NAVIGATE_TO_LOCATION, navigateToLocation));

  context.subscriptions.push(VSCode.commands.registerCommand(Commands.DEACTIVATE_RULE, toggleRule('off')));
  context.subscriptions.push(VSCode.commands.registerCommand(Commands.ACTIVATE_RULE, toggleRule('on')));

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
    VSCode.commands.registerCommand(Commands.FIND_RULE_BY_KEY, () => {
      VSCode.window
        .showInputBox({
          prompt: 'Rule Key',
          validateInput: value => allRulesTreeDataProvider.checkRuleExists(value)
        })
        .then(key => {
          // Reset rules view filter
          VSCode.commands.executeCommand(Commands.SHOW_ALL_RULES).then(() =>
            allRulesView.reveal(new RuleNode({ key: key.toUpperCase() } as Rule), {
              focus: true,
              expand: true
            })
          );
        });
    })
  );
  context.subscriptions.push(
    VSCode.commands.registerCommand(Commands.SHOW_SONARLINT_OUTPUT, () => {
      sonarlintOutput.show();
    })
  );

  context.subscriptions.push(VSCode.commands.registerCommand(Commands.INSTALL_MANAGED_JRE, installManagedJre));

  context.subscriptions.push(hotspotsCollection);
  context.subscriptions.push(VSCode.languages.registerCodeActionsProvider(
      { scheme: 'file' },
      new HotspotsCodeActionProvider(),
      { providedCodeActionKinds: [VSCode.CodeActionKind.Empty] }
    )
  );

  context.subscriptions.push(VSCode.commands.registerCommand(Commands.HIDE_HOTSPOT, hideSecurityHotspot));
  context.subscriptions.push(VSCode.commands.registerCommand(Commands.SHOW_HOTSPOT_DESCRIPTION, showHotspotDescription));

  VSCode.workspace.onDidChangeConfiguration(async event => {
    if (event.affectsConfiguration('sonarlint.rules')) {
      allRulesTreeDataProvider.refresh();
    }
  });

  languageClient.start();

  context.subscriptions.push(onConfigurationChange());

  context.subscriptions.push(
    VSCode.extensions.onDidChange(() => {
      installClasspathListener(languageClient);
    })
  );
  installClasspathListener(languageClient);
}

function installCustomRequestHandlers(context: VSCode.ExtensionContext) {
  languageClient.onRequest(protocol.ShowRuleDescriptionRequest.type, params => {
    if (!ruleDescriptionPanel) {
      ruleDescriptionPanel = VSCode.window.createWebviewPanel(
        'sonarlint.RuleDesc',
        'SonarLint Rule Description',
        VSCode.ViewColumn.Two,
        {
          enableScripts: false
        }
      );
      ruleDescriptionPanel.onDidDispose(
        () => {
          ruleDescriptionPanel = undefined;
        },
        null,
        context.subscriptions
      );
    }
    const ruleDescPanelContent = computeRuleDescPanelContent(context, ruleDescriptionPanel.webview, params);
    ruleDescriptionPanel.webview.html = ruleDescPanelContent;
    ruleDescriptionPanel.iconPath = {
      light: util.resolveExtensionFile('images/sonarlint.svg'),
      dark: util.resolveExtensionFile('images/sonarlint.svg')
    };
    ruleDescriptionPanel.reveal();
  });

  languageClient.onRequest(protocol.GetJavaConfigRequest.type, fileUri => getJavaConfig(languageClient, fileUri));
  languageClient.onRequest(protocol.ShowSonarLintOutput.type,
    () => VSCode.commands.executeCommand(Commands.SHOW_SONARLINT_OUTPUT)
  );
  languageClient.onRequest(protocol.OpenJavaHomeSettings.type,
    () => VSCode.commands.executeCommand(Commands.OPEN_SETTINGS, JAVA_HOME_CONFIG)
  );
  languageClient.onRequest(protocol.OpenPathToNodeSettings.type,
    () => VSCode.commands.executeCommand(Commands.OPEN_SETTINGS, 'sonarlint.pathToNodeExecutable')
  );
  languageClient.onRequest(protocol.BrowseTo.type,
    browseTo => VSCode.commands.executeCommand(Commands.OPEN_BROWSER, VSCode.Uri.parse(browseTo))
  );
  languageClient.onRequest(protocol.OpenConnectionSettings.type,
    isSonarCloud => {
      const targetSection = `sonarlint.connectedMode.connections.${isSonarCloud ? 'sonarcloud' : 'sonarqube'}`;
      return VSCode.commands.executeCommand(Commands.OPEN_SETTINGS, targetSection);
    }
  );
  languageClient.onRequest(protocol.ShowHotspotRequest.type, showSecurityHotspot);
  languageClient.onRequest(protocol.ShowTaintVulnerabilityRequest.type, showAllLocations);
}

async function showAllLocations(issue: protocol.Issue) {
  await secondaryLocationsTree.showAllLocations(issue);
  if (issue.creationDate) {
    const createdAgo = DateTime.fromISO(issue.creationDate).toLocaleString(DateTime.DATETIME_MED);
    issueLocationsView.message = `Analyzed ${createdAgo} on '${issue.connectionId}'`;
  } else {
    issueLocationsView.message = null;
  }
  issueLocationsView.reveal(secondaryLocationsTree.getChildren(null)[0]);
}

function clearLocations() {
  secondaryLocationsTree.hideLocations();
  issueLocationsView.message = null;
}

function onConfigurationChange() {
  return VSCode.workspace.onDidChangeConfiguration(event => {
    if (!event.affectsConfiguration('sonarlint')) {
      return;
    }
    const newConfig = getSonarLintConfiguration();

    const sonarLintLsConfigChanged =
      hasSonarLintLsConfigChanged(currentConfig, newConfig) || hasNodeJsConfigChanged(currentConfig, newConfig);

    if (sonarLintLsConfigChanged) {
      const msg = 'SonarLint Language Server configuration changed, please restart VS Code.';
      const action = 'Restart Now';
      const restartId = 'workbench.action.reloadWindow';
      currentConfig = newConfig;
      VSCode.window.showWarningMessage(msg, action).then(selection => {
        if (action === selection) {
          VSCode.commands.executeCommand(restartId);
        }
      });
    }
  });
}

function hasSonarLintLsConfigChanged(oldConfig, newConfig) {
  return !configKeyEquals('ls.javaHome', oldConfig, newConfig) || !configKeyEquals('ls.vmargs', oldConfig, newConfig);
}

function hasNodeJsConfigChanged(oldConfig, newConfig) {
  return !configKeyEquals('pathToNodeExecutable', oldConfig, newConfig);
}

function configKeyEquals(key, oldConfig, newConfig) {
  return oldConfig.get(key) === newConfig.get(key);
}

function configKeyDeepEquals(key, oldConfig, newConfig) {
  // note: lazy implementation; see for something better: https://stackoverflow.com/a/10316616/641955
  // note: may not work well for objects (non-deterministic order of keys)
  return JSON.stringify(oldConfig.get(key)) === JSON.stringify(newConfig.get(key));
}

export function parseVMargs(params: string[], vmargsLine: string) {
  if (!vmargsLine) {
    return;
  }
  const vmargs = vmargsLine.match(/(?:[^\s"]+|"[^"]*")+/g);
  if (vmargs === null) {
    return;
  }
  vmargs.forEach(arg => {
    //remove all standalone double quotes
    arg = arg.replace(/(\\)?"/g, function ($0, $1) {
      return $1 ? $0 : '';
    });
    //unescape all escaped double quotes
    arg = arg.replace(/(\\)"/g, '"');
    if (params.indexOf(arg) < 0) {
      params.push(arg);
    }
  });
}

function getSonarLintConfiguration(): VSCode.WorkspaceConfiguration {
  return VSCode.workspace.getConfiguration('sonarlint');
}

export function deactivate(): Thenable<void> {
  if (!languageClient) {
    return undefined;
  }
  return languageClient.stop();
}
