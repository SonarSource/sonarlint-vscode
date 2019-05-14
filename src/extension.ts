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
import {
  LanguageClient,
  LanguageClientOptions,
  StreamInfo,
  ExecuteCommandRequest,
  ExecuteCommandParams
} from 'vscode-languageclient';
import * as open from 'open';
import * as http from 'http';
import * as requirements from './requirements';
import { RequirementsData } from './requirements';
import { connect } from 'tls';

declare var v8debug;
const DEBUG = typeof v8debug === 'object' || startedInDebugMode();
var oldConfig;

const updateServersAndBindingStorageCommandName = 'sonarlint.updateServersAndBinding';

const connectedModeServersSectionName = 'connectedMode.servers';
const connectedModeProjectSectionName = 'connectedMode.project';

function runJavaServer(context: VSCode.ExtensionContext): Thenable<StreamInfo> {
  return requirements
    .resolveRequirements()
    .catch(error => {
      //show error
      VSCode.window.showErrorMessage(error.message, error.label).then(selection => {
        if (error.label && error.label === selection && error.openUrl) {
          VSCode.commands.executeCommand('vscode.open', error.openUrl);
        }
      });
      // rethrow to disrupt the chain.
      throw error;
    })
    .then(requirements => {
      return new Promise<StreamInfo>(function(resolve, reject) {
        const server = Net.createServer(socket => {
          console.log(`Child process connected on port ${server.address().port}`);
          resolve({
            reader: socket,
            writer: socket
          });
        });
        server.listen(0, () => {
          // Start the child java process
          const { command, args } = languageServerCommand(
            context,
            requirements,
            server.address().port
          );
          console.log(`Executing ${command} ${args.join(' ')}`);
          const process = ChildProcess.spawn(command, args);

          process.stdout.on('data', function(data) {
            console.log(data.toString());
          });
          process.stderr.on('data', function(data) {
            console.error(data.toString());
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
  const javaExecutablePath = Path.resolve(requirements.java_home + '/bin/java');

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

function toUrl(filePath) {
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

function findTypeScriptLocation() {
  const tsExt = VSCode.extensions.getExtension('vscode.typescript');
  if (tsExt) {
    const bundledTypeScriptPath = Path.resolve(
      tsExt.extensionPath,
      '..',
      'node_modules',
      'typescript',
      'lib'
    );
    if (!FS.existsSync(bundledTypeScriptPath)) {
      console.warn(
        `Unable to locate bundled TypeScript module in '${bundledTypeScriptPath}'. Please report this error to SonarLint project.`
      );
    }
    const tsdkPathSetting = VSCode.workspace.getConfiguration('typescript').get('tsdk');

    if (tsdkPathSetting) {
      const configuredTsPath = resolveInAnyWorkspaceFolder(tsdkPathSetting);
      if (configuredTsPath !== undefined) {
        return configuredTsPath;
      }
      console.warn(
        `Unable to locate TypeScript module in '${configuredTsPath}'. Falling back to the VSCode's one at '${bundledTypeScriptPath}'`
      );
    }
    return bundledTypeScriptPath;
  } else {
    console.warn(
      'Unable to locate TypeScript extension. TypeScript support in SonarLint might not work.'
    );
  }
}

let languageClient: LanguageClient;

export function activate(context: VSCode.ExtensionContext) {
  const serverOptions = () => runJavaServer(context);

  const tsPath = findTypeScriptLocation();

  // Options to control the language client
  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: 'file', language: 'javascript' },
      { scheme: 'file', language: 'javascriptreact' },
      { scheme: 'file', language: 'php' },
      { scheme: 'file', language: 'python' },
      { scheme: 'file', language: 'typescript' },
      { scheme: 'file', language: 'typescriptreact' },
      { scheme: 'file', language: 'vue' },
      { scheme: 'file', language: 'html' },
      { scheme: 'file', language: 'jsp' }
    ],
    synchronize: {
      configurationSection: 'sonarlint'
    },
    diagnosticCollectionName: 'sonarlint',
    initializationOptions: () => {
      const configuration = getSonarLintConfiguration();
      return {
        testFilePattern: configuration && configuration.get('testFilePattern'),
        analyzerProperties: configuration && configuration.get('analyzerProperties'),
        telemetryStorage: Path.resolve(context.extensionPath, '..', 'sonarlint_usage'),
        productName: 'SonarLint VSCode',
        productVersion: VSCode.extensions.getExtension('SonarSource.sonarlint-vscode').packageJSON
          .version,
        disableTelemetry: configuration ? configuration.get('disableTelemetry', false) : false,
        typeScriptLocation: tsPath ? Path.dirname(Path.dirname(tsPath)) : undefined,
        includeRuleDetailsInCodeAction: true,
        connectedModeServers: configuration && configuration.get(connectedModeServersSectionName),
        connectedModeProject: configuration && configuration.get(connectedModeProjectSectionName)
      };
    },
    outputChannelName: 'SonarLint',
    revealOutputChannelOn: 4 // never
  };

  oldConfig = getSonarLintConfiguration();

  // Create the language client and start the client.
  languageClient = new LanguageClient(
    'sonarlint-vscode',
    'SonarLint Language Server',
    serverOptions,
    clientOptions
  );

  VSCode.commands.registerCommand(
    'SonarLint.OpenRuleDesc',
    (
      ruleKey: string,
      ruleName: string,
      htmlDesc: string,
      ruleType: string,
      ruleSeverity: string
    ) => {
      let ruleDescPanelContent = computeRuleDescPanelContent(
        context,
        ruleKey,
        ruleName,
        htmlDesc,
        ruleType,
        ruleSeverity
      );
      const panel = VSCode.window.createWebviewPanel(
        'sonarlintRuleDesc',
        'SonarLint Rule Description',
        VSCode.ViewColumn.Two,
        {
          enableScripts: false
        }
      );
      panel.webview.html = ruleDescPanelContent;
    }
  );

  VSCode.commands.registerCommand(updateServersAndBindingStorageCommandName, () => {
    updateServerStorage()
      .then(updateProjectBinding)
      .then(() => {
        VSCode.window.showInformationMessage('SonarLint server storage updated');
      });
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

function computeRuleDescPanelContent(
  context: VSCode.ExtensionContext,
  ruleKey: string,
  ruleName: string,
  htmlDesc: string,
  ruleType: string,
  ruleSeverity: string
) {
  const severityImg = Path.resolve(
    context.extensionPath,
    'images',
    'severity',
    ruleSeverity.toLowerCase() + '.png'
  );
  const typeImg = Path.resolve(
    context.extensionPath,
    'images',
    'type',
    ruleType.toLowerCase() + '.png'
  );
  return `<!doctype html><html>
		<head>
		<style type="text/css">
			body { 
				font-family: Helvetica Neue,Segoe UI,Helvetica,Arial,sans-serif; 
				font-size: 13px; line-height: 1.23076923; 
			}
			
			h1 { font-size: 14px;font-weight: 500; }
			h2 { line-height: 24px;}
			a { border-bottom: 1px solid rgba(230, 230, 230, .1); color: #236a97; cursor: pointer; outline: none; text-decoration: none; transition: all .2s ease;}
			
			.rule-desc { line-height: 1.5;}
			.rule-desc { line-height: 1.5;}
			.rule-desc h2 { font-size: 16px; font-weight: 400;}
			.rule-desc code { padding: .2em .45em; margin: 0; border-radius: 3px; white-space: nowrap;}
			.rule-desc pre { padding: 10px; border-top: 1px solid rgba(230, 230, 230, .1); border-bottom: 1px solid rgba(230, 230, 230, .1); line-height: 18px; overflow: auto;}
			.rule-desc code, .rule-desc pre { font-family: Consolas,Liberation Mono,Menlo,Courier,monospace; font-size: 12px;}
			.rule-desc ul { padding-left: 40px; list-style: disc;}
		</style>
		</head>
		<body><h1><big>${escapeHtml(ruleName)}</big> (${ruleKey})</h1>
		<div>
		<img style="padding-bottom: 1px;vertical-align: middle" width="16" height="16" alt="${ruleType}" src="data:image/gif;base64,${base64_encode(
    typeImg
  )}">&nbsp;
		${clean(ruleType)}&nbsp;
		<img style="padding-bottom: 1px;vertical-align: middle" width="16" height="16" alt="${ruleSeverity}" src="data:image/gif;base64,${base64_encode(
    severityImg
  )}">&nbsp;
		${clean(ruleSeverity)}
		</div>
		<div class=\"rule-desc\">${htmlDesc}</div>
		</body></html>`;
}

var entityMap = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;'
};

function escapeHtml(str: string) {
  return String(str).replace(/[&<>"'`=\/]/g, function(s) {
    return entityMap[s];
  });
}

function clean(str: string) {
  return capitalizeName(
    str
      .toLowerCase()
      .split('_')
      .join(' ')
  );
}

function capitalizeName(name: string) {
  return name.replace(/\b(\w)/g, s => s.toUpperCase());
}

function base64_encode(file) {
  const bitmap = FS.readFileSync(file);
  return new Buffer(bitmap).toString('base64');
}

function logNotification(message: string, ...items: string[]) {
  return new Promise((resolve, reject) => {
    console.log(message);
  });
}

function onConfigurationChange() {
  return VSCode.workspace.onDidChangeConfiguration(event => {
    if (!event.affectsConfiguration('sonarlint')) {
      return;
    }
    const newConfig = getSonarLintConfiguration();

    const sonarLintLsConfigChanged = hasSonarLintLsConfigChanged(oldConfig, newConfig);
    const serversChanged = !configKeyDeepEquals(
      connectedModeServersSectionName,
      oldConfig,
      newConfig
    );
    const bindingChanged = !configKeyDeepEquals(
      connectedModeProjectSectionName,
      oldConfig,
      newConfig
    );

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
  return (
    !configKeyEquals('ls.javaHome', oldConfig, newConfig) ||
    !configKeyEquals('ls.vmargs', oldConfig, newConfig)
  );
}

function configKeyEquals(key, oldConfig, newConfig) {
  return oldConfig.get(key) === newConfig.get(key);
}

function configKeyDeepEquals(key, oldConfig, newConfig) {
  // note: lazy implementation; see for something better: https://stackoverflow.com/a/10316616/641955
  // note: may not work well for objects (non-deterministic order of keys)
  return JSON.stringify(oldConfig.get(key)) === JSON.stringify(newConfig.get(key));
}

export function parseVMargs(params: any[], vmargsLine: string) {
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

function startedInDebugMode(): boolean {
  const args = (process as any).execArgv;
  if (args) {
    return args.some(
      arg => /^--debug=?/.test(arg) || /^--debug-brk=?/.test(arg) || /^--inspect-brk=?/.test(arg)
    );
  }
  return false;
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
