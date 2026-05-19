/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
import * as Path from 'path';
import * as VSCode from 'vscode';
import { TransportKind } from 'vscode-languageclient/node';
import { getSonarLintConfiguration } from '../settings/settings';
import { RequirementsData } from '../util/requirements';
import * as util from '../util/util';

declare let v8debug: object;
const DEBUG = typeof v8debug === 'object' || util.startedInDebugMode(process);

export function languageServerCommand(
  context: VSCode.ExtensionContext,
  requirements: RequirementsData
) {
  const serverJar = Path.resolve(context.extensionPath, 'server', 'sonarlint-ls.jar');
  const javaExecutablePath = Path.resolve(requirements.javaHome, 'bin', 'java');

  const params = [];
  if (DEBUG) {
    params.push(
      '-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=8000,quiet=y',
      '-Dsonarlint.telemetry.disabled=true'
    );
  } else {
    params.push('-Dsonarlint.monitoring.enabled=true');
  }

  const sonarLintConfiguration = getSonarLintConfiguration();
  const vmargs = sonarLintConfiguration.get('ls.vmargs', '');
  parseVMargs(params, vmargs);

  params.push(
    '-jar', serverJar,
    '-stdio',
    '-analyzers',
    Path.resolve(context.extensionPath, 'analyzers', 'sonargo.jar'),
    Path.resolve(context.extensionPath, 'analyzers', 'sonarjava.jar'),
    Path.resolve(context.extensionPath, 'analyzers', 'sonarjavasymbolicexecution.jar'),
    Path.resolve(context.extensionPath, 'analyzers', 'sonarjs.jar'),
    Path.resolve(context.extensionPath, 'analyzers', 'sonarphp.jar'),
    Path.resolve(context.extensionPath, 'analyzers', 'sonarpython.jar'),
    Path.resolve(context.extensionPath, 'analyzers', 'sonarhtml.jar'),
    Path.resolve(context.extensionPath, 'analyzers', 'sonarxml.jar'),
    Path.resolve(context.extensionPath, 'analyzers', 'sonartext.jar'),
    Path.resolve(context.extensionPath, 'analyzers', 'sonariac.jar'),
    Path.resolve(context.extensionPath, 'analyzers', 'sonarlintomnisharp.jar')
  );

  return { command: javaExecutablePath, args: params, transport: TransportKind.stdio };
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
    if (!params.includes(arg)) {
      params.push(arg);
    }
  });
}
