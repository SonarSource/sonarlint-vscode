/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2018 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
"use strict";
import * as VSCode from "vscode";
import * as Path from "path";
import * as FS from "fs";
import * as Net from "net";
import * as ChildProcess from "child_process";
import {
  LanguageClient,
  LanguageClientOptions,
  StreamInfo
} from "vscode-languageclient";
import * as open from "open";
import * as http from "http";
import * as requirements from "./requirements";
import { RequirementsData } from "./requirements";
import { connect } from "tls";

declare var v8debug;
const DEBUG = typeof v8debug === "object" || startedInDebugMode();
var oldConfig;

var lastStatus;
function runJavaServer(context: VSCode.ExtensionContext): Thenable<StreamInfo> {
  return requirements
    .resolveRequirements()
    .catch(error => {
      //show error
      VSCode.window
        .showErrorMessage(error.message, error.label)
        .then(selection => {
          if (error.label && error.label === selection && error.openUrl) {
            VSCode.commands.executeCommand("vscode.open", error.openUrl);
          }
        });
      // rethrow to disrupt the chain.
      throw error;
    })
    .then(requirements => {
      return new Promise<StreamInfo>(function(resolve, reject) {
        const server = Net.createServer(socket => {
          console.log(
            "Child process connected on port " + server.address().port
          );
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
          console.log("Executing " + command + " " + args.join(" "));
          const process = ChildProcess.spawn(command, args);

          process.stdout.on("data", function(data) {
            console.log(data.toString());
          });
          process.stderr.on("data", function(data) {
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
  const serverJar = Path.resolve(
    context.extensionPath,
    "server",
    "sonarlint-ls.jar"
  );
  const javaExecutablePath = Path.resolve(requirements.java_home + "/bin/java");

  const params = [];
  if (DEBUG) {
    params.push(
      "-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=8000"
    );
    params.push("-Dsonarlint.telemetry.disabled=true");
  }
  const vmargs = getSonarLintConfiguration().get("ls.vmargs", "");
  parseVMargs(params, vmargs);
  params.push("-jar", serverJar, "" + port);
  params.push(
    toUrl(Path.resolve(context.extensionPath, "analyzers", "sonarjs.jar"))
  );
  params.push(
    toUrl(Path.resolve(context.extensionPath, "analyzers", "sonarphp.jar"))
  );
  params.push(
    toUrl(Path.resolve(context.extensionPath, "analyzers", "sonarpython.jar"))
  );
  params.push(
    toUrl(Path.resolve(context.extensionPath, "analyzers", "sonarts.jar"))
  );
  return { command: javaExecutablePath, args: params };
}

function toUrl(filePath) {
  var pathName = Path.resolve(filePath).replace(/\\/g, "/");

  // Windows drive letter must be prefixed with a slash
  if (pathName[0] !== "/") {
    pathName = "/" + pathName;
  }

  return encodeURI("file://" + pathName);
}

function resolveInAnyWorkspaceFolder(tsdkPathSetting) {
  if (Path.isAbsolute(tsdkPathSetting)) {
    return FS.existsSync(tsdkPathSetting) ? tsdkPathSetting : undefined;
  }
  for (const folder of (VSCode.workspace.workspaceFolders || [])) {
    const configuredTsPath = Path.join(folder.uri.fsPath, tsdkPathSetting);
    if (FS.existsSync(configuredTsPath)) {
      return configuredTsPath;
    }
  }
  return undefined;
}

function findTypeScriptLocation() {
  const tsExt = VSCode.extensions.getExtension("vscode.typescript");
  if (tsExt) {
    const bundledTypeScriptPath = Path.resolve(
      tsExt.extensionPath,
      "..",
      "node_modules",
      "typescript",
      "lib"
    );
    if (!FS.existsSync(bundledTypeScriptPath)) {
      console.warn(
        `Unable to locate bundled TypeScript module in '${bundledTypeScriptPath}'. Please report this error to SonarLint project.`
      );
    }
    const tsdkPathSetting = VSCode.workspace
      .getConfiguration("typescript")
      .get("tsdk");

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
      "Unable to locate TypeScript extension. TypeScript support in SonarLint might not work."
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
      "javascript",
      "javascriptreact",
      "php",
      "python",
      "typescript",
      "typescriptreact",
      "vue"
    ],
    synchronize: {
      configurationSection: "sonarlint"
    },
    diagnosticCollectionName: "sonarlint",
    initializationOptions: () => {
      const configuration = getSonarLintConfiguration();
      return {
        testFilePattern: configuration
          ? configuration.get("testFilePattern", undefined)
          : undefined,
        analyzerProperties: configuration
          ? configuration.get("analyzerProperties", undefined)
          : undefined,
        telemetryStorage: Path.resolve(
          context.extensionPath,
          "..",
          "sonarlint_usage"
        ),
        productName: "SonarLint VSCode",
        productVersion: VSCode.extensions.getExtension(
          "SonarSource.sonarlint-vscode"
        ).packageJSON.version,
        disableTelemetry: configuration
          ? configuration.get("disableTelemetry", false)
          : false,
        typeScriptLocation: tsPath
          ? Path.dirname(Path.dirname(tsPath))
          : undefined,
        connectedModeServers: configuration
          ? configuration.get("connectedMode.servers")
          : undefined,
        connectedModeProject: configuration
          ? configuration.get("connectedMode.project")
          : undefined
      };
    },
    outputChannelName: "SonarLint",
    revealOutputChannelOn: 4 // never
  };

  oldConfig = getSonarLintConfiguration();

  // Create the language client and start the client.
  languageClient = new LanguageClient(
    "sonarlint-vscode",
    "SonarLint Language Server",
    serverOptions,
    clientOptions
  );

  // TODO for workspace folder support, remove when possible in a later release
  languageClient.registerProposedFeatures();

  const disposable = languageClient.start();

  // Push the disposable to the context's subscriptions so that the
  // client can be deactivated on extension deactivation
  context.subscriptions.push(disposable);
  context.subscriptions.push(onConfigurationChange());

  var ruleDescPanelContent = "No description";

  class TextDocumentContentProvider
    implements VSCode.TextDocumentContentProvider {
    private readonly _onDidChange = new VSCode.EventEmitter<VSCode.Uri>();

    get onDidChange(): VSCode.Event<VSCode.Uri> {
      return this._onDidChange.event;
    }

    public update(uri: VSCode.Uri) {
      this._onDidChange.fire(uri);
    }

    public provideTextDocumentContent(uri: VSCode.Uri): string {
      return ruleDescPanelContent;
    }
  }

  const provider = new TextDocumentContentProvider();
  const registration = VSCode.workspace.registerTextDocumentContentProvider(
    "sonarlint-rule",
    provider
  );
  context.subscriptions.push(registration);

  const showRuleUri = VSCode.Uri.parse("sonarlint-rule://show");

  const openRuleCommand = VSCode.commands.registerCommand(
    "SonarLint.OpenRuleDesc",
    (
      ruleKey: string,
      ruleName: string,
      htmlDesc: string,
      ruleType: string,
      ruleSeverity: string
    ) => {
      ruleDescPanelContent = computeRuleDescPanelContent(
        context,
        ruleKey,
        ruleName,
        htmlDesc,
        ruleType,
        ruleSeverity
      );
      VSCode.commands
        .executeCommand(
          "vscode.previewHtml",
          showRuleUri,
          VSCode.ViewColumn.Two,
          "SonarLint Rule Description"
        )
        .then(
          success => {
            provider.update(showRuleUri);
          },
          reason => {
            VSCode.window.showErrorMessage(reason);
          }
        );
    }
  );

  context.subscriptions.push(openRuleCommand);
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
    "images",
    "severity",
    ruleSeverity.toLowerCase() + ".png"
  );
  const typeImg = Path.resolve(
    context.extensionPath,
    "images",
    "type",
    ruleType.toLowerCase() + ".png"
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
		<body><h1><big>${ruleName}</big> (${ruleKey})</h1>
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

function clean(str: string) {
  return capitalizeName(
    str
      .toLowerCase()
      .split("_")
      .join(" ")
  );
}

function capitalizeName(name: string) {
  return name.replace(/\b(\w)/g, s => s.toUpperCase());
}

function base64_encode(file) {
  const bitmap = FS.readFileSync(file);
  return new Buffer(bitmap).toString("base64");
}

function logNotification(message: string, ...items: string[]) {
  return new Promise((resolve, reject) => {
    console.log(message);
  });
}

function onConfigurationChange() {
  return VSCode.workspace.onDidChangeConfiguration(params => {
    const newConfig = getSonarLintConfiguration();
    if (hasSonarLintLsConfigChanged(oldConfig, newConfig)) {
      const msg =
        "SonarLint Language Server configuration changed, please restart VS Code.";
      const action = "Restart Now";
      const restartId = "workbench.action.reloadWindow";
      oldConfig = newConfig;
      VSCode.window.showWarningMessage(msg, action).then(selection => {
        if (action === selection) {
          VSCode.commands.executeCommand(restartId);
        }
      });
    }
  });
}

function hasSonarLintLsConfigChanged(oldConfig, newConfig) {
  return (
    hasConfigKeyChanged("ls.javaHome", oldConfig, newConfig) ||
    hasConfigKeyChanged("ls.vmargs", oldConfig, newConfig)
  );
}

function hasConfigKeyChanged(key, oldConfig, newConfig) {
  return oldConfig.get(key) !== newConfig.get(key);
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
      return $1 ? $0 : "";
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
      arg =>
        /^--debug=?/.test(arg) ||
        /^--debug-brk=?/.test(arg) ||
        /^--inspect-brk=?/.test(arg)
    );
  }
  return false;
}

function getSonarLintConfiguration(): VSCode.WorkspaceConfiguration {
  return VSCode.workspace.getConfiguration("sonarlint");
}

export function deactivate(): Thenable<void> {
  if (!languageClient) {
    return undefined;
  }
  return languageClient.stop();
}
