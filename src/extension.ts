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
import * as PortFinder from "portfinder";
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
        PortFinder.getPort({ port: 55282 }, (err, languageServerPort) => {
          let serverJar = Path.resolve(
            context.extensionPath,
            "server",
            "sonarlint-ls.jar"
          );
          let javaExecutablePath = Path.resolve(
            requirements.java_home + "/bin/java"
          );

          let params = [];
          if (DEBUG) {
            params.push(
              "-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=8000"
            );
            params.push("-Dsonarlint.telemetry.disabled=true");
          }
          let vmargs = getSonarLintConfiguration().get("ls.vmargs", "");
          parseVMargs(params, vmargs);
          params.push("-jar", serverJar, "" + languageServerPort);
          params.push(
            toUrl(
              Path.resolve(context.extensionPath, "analyzers", "sonarjs.jar")
            )
          );
          params.push(
            toUrl(
              Path.resolve(context.extensionPath, "analyzers", "sonarphp.jar")
            )
          );
          params.push(
            toUrl(
              Path.resolve(
                context.extensionPath,
                "analyzers",
                "sonarpython.jar"
              )
            )
          );

          console.log(
            "Executing " + javaExecutablePath + " " + params.join(" ")
          );

          Net.createServer(socket => {
            console.log(
              "Child process connected on port " + languageServerPort
            );
            resolve({
              reader: socket,
              writer: socket
            });
          }).listen(languageServerPort, () => {
            // Start the child java process
            let options = { cwd: VSCode.workspace.rootPath };
            let process = ChildProcess.spawn(
              javaExecutablePath,
              params,
              options
            );

            process.stdout.on("data", function(data) {
              console.log(data.toString());
            });
            process.stderr.on("data", function(data) {
              console.log(data.toString());
            });
          });
        });
      });
    });
}

function toUrl(filePath) {
  var pathName = Path.resolve(filePath).replace(/\\/g, "/");

  // Windows drive letter must be prefixed with a slash
  if (pathName[0] !== "/") {
    pathName = "/" + pathName;
  }

  return encodeURI("file://" + pathName);
}

export function activate(context: VSCode.ExtensionContext) {
  let serverOptions = () => runJavaServer(context);

  // Options to control the language client
  let clientOptions: LanguageClientOptions = {
    documentSelector: ["javascript", "javascriptreact", "php", "python"],
    synchronize: {
      configurationSection: "sonarlint"
    },
    diagnosticCollectionName: "sonarlint",
    initializationOptions: () => {
      let configuration = VSCode.workspace.getConfiguration("sonarlint");
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
          : false
      };
    },
    outputChannelName: "SonarLint",
    revealOutputChannelOn: 4 // never
  };

  oldConfig = getSonarLintConfiguration();
  // Create the language client and start the client.
  let languageClient = new LanguageClient(
    "sonarlint-vscode",
    "SonarLint Language Server",
    serverOptions,
    clientOptions
  );
  let disposable = languageClient.start();

  // Push the disposable to the context's subscriptions so that the
  // client can be deactivated on extension deactivation
  context.subscriptions.push(disposable);
  context.subscriptions.push(onConfigurationChange());

  var ruleDescPanelContent = "No description";

  class TextDocumentContentProvider
    implements VSCode.TextDocumentContentProvider {
    private _onDidChange = new VSCode.EventEmitter<VSCode.Uri>();

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

  let provider = new TextDocumentContentProvider();
  let registration = VSCode.workspace.registerTextDocumentContentProvider(
    "sonarlint-rule",
    provider
  );
  context.subscriptions.push(registration);

  let showRuleUri = VSCode.Uri.parse("sonarlint-rule://show");

  let openRuleCommand = VSCode.commands.registerCommand(
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
  let severityImg = Path.resolve(
    context.extensionPath,
    "images",
    "severity",
    ruleSeverity.toLowerCase() + ".png"
  );
  let typeImg = Path.resolve(
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
  var bitmap = FS.readFileSync(file);
  return new Buffer(bitmap).toString("base64");
}

function logNotification(message: string, ...items: string[]) {
  return new Promise((resolve, reject) => {
    console.log(message);
  });
}

function onConfigurationChange() {
  return VSCode.workspace.onDidChangeConfiguration(params => {
    let newConfig = getSonarLintConfiguration();
    if (hasSonarLintLsConfigChanged(oldConfig, newConfig)) {
      let msg =
        "SonarLint Language Server configuration changed, please restart VS Code.";
      let action = "Restart Now";
      let restartId = "workbench.action.reloadWindow";
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
  let vmargs = vmargsLine.match(/(?:[^\s"]+|"[^"]*")+/g);
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
  let args = (process as any).execArgv;
  if (args) {
    return args.some(
      arg => /^--debug=?/.test(arg) || /^--debug-brk=?/.test(arg)
    );
  }
  return false;
}

function getSonarLintConfiguration(): VSCode.WorkspaceConfiguration {
  return VSCode.workspace.getConfiguration("sonarlint");
}

export function deactivate() {}
