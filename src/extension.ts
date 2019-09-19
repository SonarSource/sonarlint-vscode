/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2019 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
import * as VSCode from 'vscode';
import * as Path from 'path';
import * as FS from 'fs';
import * as Net from 'net';
import * as ChildProcess from 'child_process';
import { LanguageClientOptions, StreamInfo, ExecuteCommandRequest, ExecuteCommandParams } from 'vscode-languageclient';

import { AllRulesTreeDataProvider, RuleDescription, RuleNode, ConfigLevel } from './rules';
import { Commands } from './commands';
import { SonarLintLanguageClient } from './client';
import { startedInDebugMode } from './util';
import { resolveRequirements, RequirementsData } from './requirements';
import { computeRuleDescPanelContent } from './rulepanel';

declare var v8debug: object;
const DEBUG = typeof v8debug === 'object' || startedInDebugMode(process);
let oldConfig: VSCode.WorkspaceConfiguration;

const connectedModeServersSectionName = 'connectedMode.servers';
const connectedModeProjectSectionName = 'connectedMode.project';

const DOCUMENT_SELECTOR = [
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
  { scheme: 'file', language: 'plsql' }
];

let sonarlintOutput: VSCode.OutputChannel;
let ruleDescriptionPanel: VSCode.WebviewPanel;
let languageClient: SonarLintLanguageClient;

function logToSonarLintOutput(message) {
  if (sonarlintOutput) {
    sonarlintOutput.appendLine(message);
  }
}

function appendToSonarLintOutput(message) {
  if (sonarlintOutput) {
    sonarlintOutput.append(message);
  }
}

function runJavaServer(context: VSCode.ExtensionContext): Thenable<StreamInfo> {
  return resolveRequirements()
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
          logToSonarLintOutput(`Child process connected on port ${server.address().port}`);
          resolve({
            reader: socket,
            writer: socket
          });
        });
        server.listen(0, () => {
          // Start the child java process
          const { command, args } = languageServerCommand(context, requirements, server.address().port);
          logToSonarLintOutput(`Executing ${command} ${args.join(' ')}`);
          const process = ChildProcess.spawn(command, args);

          process.stdout.on('data', function(data) {
            appendToSonarLintOutput(data.toString());
          });
          process.stderr.on('data', function(data) {
            appendToSonarLintOutput(data.toString());
          });
        });
      });
    });
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
  params.push('-jar', serverJar, '' + port);
  params.push(toUrl(Path.resolve(context.extensionPath, 'analyzers', 'sonarjs.jar')));
  params.push(toUrl(Path.resolve(context.extensionPath, 'analyzers', 'sonarphp.jar')));
  params.push(toUrl(Path.resolve(context.extensionPath, 'analyzers', 'sonarpython.jar')));
  params.push(toUrl(Path.resolve(context.extensionPath, 'analyzers', 'sonarts.jar')));
  params.push(toUrl(Path.resolve(context.extensionPath, 'analyzers', 'sonarhtml.jar')));
  return { command: javaExecutablePath, args: params };
}

export function toUrl(filePath) {
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
  const tsExt = VSCode.extensions.getExtension('vscode.typescript');
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
        `Unable to locate TypeScript module in "${configuredTsPath}". Falling back to the VSCode"s one at "${bundledTypeScriptPath}"`
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
    const actualKey = typeof ruleKey === 'string' ? ruleKey : ruleKey.rule.key;
    const configuration = getSonarLintConfiguration();
    const rules = configuration.get('rules') || {};
    rules[actualKey] = { level };
    return configuration.update('rules', rules, VSCode.ConfigurationTarget.Global);
  };
}

export function activate(context: VSCode.ExtensionContext) {
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
    diagnosticCollectionName: 'sonarlint',
    initializationOptions: () => {
      const configuration = getSonarLintConfiguration();
      return {
        testFilePattern: configuration && configuration.get('testFilePattern'),
        analyzerProperties: configuration && configuration.get('analyzerProperties'),
        productKey: 'vscode',
        telemetryStorage: Path.resolve(context.extensionPath, '..', 'sonarlint_usage'),
        productName: 'SonarLint VSCode',
        productVersion: VSCode.extensions.getExtension('SonarSource.sonarlint-vscode').packageJSON.version,
        disableTelemetry: configuration ? configuration.get('disableTelemetry', false) : false,
        typeScriptLocation: tsPath ? Path.dirname(Path.dirname(tsPath)) : undefined,
        includeRuleDetailsInCodeAction: true,
        connectedModeServers: configuration && configuration.get(connectedModeServersSectionName),
        connectedModeProject: configuration && configuration.get(connectedModeProjectSectionName)
      };
    },
    outputChannel: sonarlintOutput,
    revealOutputChannelOn: 4 // never
  };

  oldConfig = getSonarLintConfiguration();

  // Create the language client and start the client.
  // id parameter is used to load 'sonarlint.trace.server' configuration
  languageClient = new SonarLintLanguageClient('sonarlint', 'SonarLint Language Server', serverOptions, clientOptions);

  const allRulesTreeDataProvider = new AllRulesTreeDataProvider(
    languageClient.onReady().then(() => languageClient.listAllRules())
  );
  const allRulesView = VSCode.window.createTreeView('SonarLint.AllRules', {
    treeDataProvider: allRulesTreeDataProvider
  });
  context.subscriptions.push(allRulesView);

  context.subscriptions.push(
    VSCode.commands.registerCommand(
      Commands.OPEN_RULE_DESCRIPTION,
      (key: string, name: string, htmlDescription: string, type: string, severity: string) => {
        const rule = { key, name, htmlDescription, type, severity } as RuleDescription;
        allRulesView.reveal(new RuleNode(rule), { expand: true });
        const ruleDescPanelContent = computeRuleDescPanelContent(context, rule);
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
        ruleDescriptionPanel.webview.html = ruleDescPanelContent;
        ruleDescriptionPanel.reveal();
      }
    )
  );

  context.subscriptions.push(VSCode.commands.registerCommand(Commands.DEACTIVATE_RULE, toggleRule('off')));
  context.subscriptions.push(VSCode.commands.registerCommand(Commands.ACTIVATE_RULE, toggleRule('on')));
  context.subscriptions.push(
    VSCode.commands.registerCommand(Commands.RESET_DEFAULT_RULE, (ruleNode: RuleNode) => {
      const configuration = getSonarLintConfiguration();
      const rules = configuration.get('rules') || {};
      delete rules[ruleNode.rule.key];
      return configuration.update('rules', rules, VSCode.ConfigurationTarget.Global);
    })
  );

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
          prompt: 'Rule Key'
        })
        .then(key => allRulesView.reveal(new RuleNode({ key } as RuleDescription), { expand: true }));
    })
  );

  context.subscriptions.push(
    VSCode.commands.registerCommand(Commands.UPDATE_SERVERS_AND_BINDING_STORAGE, () => {
      updateServerStorage()
        .then(updateProjectBinding)
        .then(() => {
          VSCode.window.showInformationMessage('SonarLint server storage updated');
        });
    })
  );

  VSCode.workspace.onDidChangeConfiguration(async event => {
    if (event.affectsConfiguration('sonarlint.rules')) {
      allRulesTreeDataProvider.refresh();
      const supportedLangs = DOCUMENT_SELECTOR.map(s => s.language);
      const refreshArgs = VSCode.workspace.textDocuments
        // Ask for a refresh of diagnostics only on open documents supported by the language server
        .filter(doc => !doc.isClosed && supportedLangs.indexOf(doc.languageId) >= 0)
        .map(doc => ({ uri: doc.uri.toString(), text: doc.getText() }));
      return languageClient.onReady().then(async () => {
        const params: ExecuteCommandParams = {
          command: 'SonarLint.RefreshDiagnostics',
          arguments: refreshArgs
        };
        return languageClient.sendRequest(ExecuteCommandRequest.type, params);
      });
    }
  });

  languageClient.start();

  context.subscriptions.push(onConfigurationChange());
}

function updateServerStorage(): Thenable<void> {
  const params: ExecuteCommandParams = {
    command: 'SonarLint.UpdateServerStorage',
    arguments: getSonarLintConfiguration().get(connectedModeServersSectionName)
  };
  return languageClient.onReady().then(() =>
    languageClient.sendRequest(ExecuteCommandRequest.type, params).then(
      success => {},
      reason => {
        VSCode.window.showWarningMessage('Failed to update SonarLint server storage');
      }
    )
  );
}

function updateProjectBinding(): Thenable<void> {
  const params: ExecuteCommandParams = {
    command: 'SonarLint.UpdateProjectBinding',
    arguments: getSonarLintConfiguration().get(connectedModeProjectSectionName)
  };
  return languageClient.onReady().then(() =>
    languageClient.sendRequest(ExecuteCommandRequest.type, params).then(
      success => {},
      reason => {
        VSCode.window.showWarningMessage('Failed to update SonarLint project binding');
      }
    )
  );
}

function onConfigurationChange() {
  return VSCode.workspace.onDidChangeConfiguration(event => {
    if (!event.affectsConfiguration('sonarlint')) {
      return;
    }
    const newConfig = getSonarLintConfiguration();

    const sonarLintLsConfigChanged = hasSonarLintLsConfigChanged(oldConfig, newConfig);
    const serversChanged = !configKeyDeepEquals(connectedModeServersSectionName, oldConfig, newConfig);
    const bindingChanged = !configKeyDeepEquals(connectedModeProjectSectionName, oldConfig, newConfig);

    if (sonarLintLsConfigChanged) {
      const msg = 'SonarLint Language Server configuration changed, please restart VS Code.';
      const action = 'Restart Now';
      const restartId = 'workbench.action.reloadWindow';
      oldConfig = newConfig;
      VSCode.window.showWarningMessage(msg, action).then(selection => {
        if (action === selection) {
          VSCode.commands.executeCommand(restartId);
        }
      });
    }

    if (serversChanged && bindingChanged) {
      oldConfig = newConfig;
      updateServerStorage().then(updateProjectBinding);
    } else if (serversChanged) {
      oldConfig = newConfig;
      updateServerStorage();
    } else if (bindingChanged) {
      oldConfig = newConfig;
      updateProjectBinding();
    }
  });
}

function hasSonarLintLsConfigChanged(oldConfig, newConfig) {
  return !configKeyEquals('ls.javaHome', oldConfig, newConfig) || !configKeyEquals('ls.vmargs', oldConfig, newConfig);
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
    arg = arg.replace(/(\\)?"/g, function($0, $1) {
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
