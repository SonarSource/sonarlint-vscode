'use strict';
import * as VSCode from 'vscode';
import * as Path from "path";
import * as FS from "fs";
import * as PortFinder from "portfinder";
import * as Net from "net";
import * as ChildProcess from "child_process";
import {LanguageClient, LanguageClientOptions, StreamInfo} from "vscode-languageclient";
import * as open from "open";
import * as requirements from './requirements';

declare var v8debug;
const DEBUG = ( typeof v8debug === 'object') || startedInDebugMode();
var oldConfig;

var lastStatus;
function runJavaServer(context: VSCode.ExtensionContext) : Thenable<StreamInfo> {
	return requirements.resolveRequirements().catch(error =>{
		//show error
		VSCode.window.showErrorMessage(error.message, error.label).then((selection )=>{
			if(error.label && error.label === selection && error.openUrl){
				VSCode.commands.executeCommand('vscode.open', error.openUrl);
			}
		});
		// rethrow to disrupt the chain.
		throw error;
	})
	.then(requirements => {
		return new Promise<StreamInfo>(function(resolve, reject) {
			PortFinder.getPort({port: 55282}, (err, languageServerPort) => {
				let serverJar = Path.resolve(context.extensionPath, "server", "sonarlint-ls.jar");
				let javaExecutablePath =  Path.resolve (requirements.java_home + '/bin/java');

				let params = [];
				if (DEBUG) {
					params.push('-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=8000');
					params.push('-Dsonarlint.telemetry.disabled=true');
				}
				let vmargs = getSonarLintConfiguration().get('ls.vmargs','');
				parseVMargs(params, vmargs);
				params.push('-jar', serverJar, '' + languageServerPort);

				console.log('Executing '+ javaExecutablePath + ' '+ params.join(' '));
				
				Net.createServer(socket => {
					console.log('Child process connected on port ' + languageServerPort);
					resolve({
						reader: socket,
						writer: socket
					});
				}).listen(languageServerPort, () => {
					// Start the child java process
					let options = { cwd: VSCode.workspace.rootPath };
					let process = ChildProcess.spawn(javaExecutablePath, params, options);

					process.stdout.on('data', function(data) {
						console.log(data.toString()); 
					});
					process.stderr.on('data', function(data) {
						console.log(data.toString()); 
					});
				});
			});
		});
	});
}

export function activate(context: VSCode.ExtensionContext) {
	let serverOptions = () => runJavaServer(context);

	// Options to control the language client
	let clientOptions: LanguageClientOptions = {
		documentSelector: ['javascript', 'javascriptreact', 'php', 'python'],
		synchronize: {
			configurationSection: 'sonarlint'
		},
		diagnosticCollectionName: 'sonarlint',
		initializationOptions: () => {
			let configuration = VSCode.workspace.getConfiguration('sonarlint');
			return {
				testFilePattern: configuration ? configuration.get('testFilePattern', undefined) : undefined,
				analyzerProperties: configuration ? configuration.get('analyzerProperties', undefined) : undefined,
				telemetryStorage: Path.resolve(context.extensionPath, "sonarlint_usage"),
				productName: 'SonarLint VSCode',
				productVersion: VSCode.extensions.getExtension('SonarSource.sonarlint-vscode').packageJSON.version,
				disableTelemetry: configuration ? configuration.get('disableTelemetry', false) : false
			};
		},
		outputChannelName: 'SonarLint',
		revealOutputChannelOn: 4 // never
	};

    oldConfig = getSonarLintConfiguration();
	// Create the language client and start the client.
	let languageClient = new LanguageClient('sonarlint-vscode','SonarLint Language Server', serverOptions, clientOptions);
	let disposable = languageClient.start();

	// Push the disposable to the context's subscriptions so that the
	// client can be deactivated on extension deactivation
	context.subscriptions.push(disposable);
	context.subscriptions.push(onConfigurationChange());

	let disposableCommand = VSCode.commands.registerCommand('SonarLint.OpenRuleDesc', (ruleKey, ruleServerPort) => {
		open("http://localhost:" + ruleServerPort + "/?ruleKey=" + encodeURIComponent(ruleKey));
	});

	context.subscriptions.push(disposableCommand);
}

function logNotification(message:string, ...items: string[]) {
	return new Promise((resolve, reject) => {
    	console.log(message);
	});
}

function onConfigurationChange() {
	return VSCode.workspace.onDidChangeConfiguration(params => {
		let newConfig = getSonarLintConfiguration();
		if (hasSonarLintLsConfigChanged(oldConfig, newConfig)) {
		  let msg =	'SonarLint Language Server configuration changed, please restart VS Code.';
		  let action =	'Restart Now';
		  let restartId = 'workbench.action.reloadWindow';
		  oldConfig = newConfig;
		  VSCode.window.showWarningMessage(msg,action).then((selection )=>{
			  if(action === selection) {
				VSCode.commands.executeCommand(restartId);
			  }
		  });
		}
	});
}

function hasSonarLintLsConfigChanged(oldConfig, newConfig) {
	return hasConfigKeyChanged('ls.javaHome', oldConfig, newConfig)
		|| hasConfigKeyChanged('ls.vmargs', oldConfig, newConfig);
}

function hasConfigKeyChanged(key, oldConfig, newConfig) {
	return oldConfig.get(key) !== newConfig.get(key);
}

export function parseVMargs(params:any[], vmargsLine:string) {
	if (!vmargsLine) {
		return;
	}
	let vmargs = vmargsLine.match(/(?:[^\s"]+|"[^"]*")+/g);
	if (vmargs === null) {
		return;
	}
	vmargs.forEach (arg => {
		//remove all standalone double quotes
		arg = arg.replace( /(\\)?"/g, function ($0, $1) { return ($1 ? $0 : ''); });
		//unescape all escaped double quotes
		arg = arg.replace( /(\\)"/g, '"');
		if (params.indexOf(arg) < 0) {
			params.push(arg);
		}
	});
}

function startedInDebugMode(): boolean {
	let args = (process as any).execArgv;
	if (args) {
		return args.some((arg) => /^--debug=?/.test(arg) || /^--debug-brk=?/.test(arg));
	};
	return false;
}

function getSonarLintConfiguration():VSCode.WorkspaceConfiguration {
	return VSCode.workspace.getConfiguration('sonarlint');
}

export function deactivate() {
}