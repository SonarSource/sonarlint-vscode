/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as child_process from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';
import { BaseConnection, SonarCloudConnection, SonarQubeConnection } from '../settings/connectionsettings';
import { ServerType } from '../connected/connections';

export function startedInDebugMode(process: NodeJS.Process): boolean {
  const args = process.execArgv;
  if (args) {
    return args.some(arg => /^--debug=?/.test(arg) || /^--debug-brk=?/.test(arg) || /^--inspect-brk=?/.test(arg));
  }
  return false;
}

export const extension = vscode.extensions.getExtension('SonarSource.sonarlint-vscode');
export const packageJson = extension.packageJSON;

export let extensionPath: string;
export let extensionContext: vscode.ExtensionContext;

export function setExtensionContext(context: vscode.ExtensionContext): void {
  extensionContext = context;
  extensionPath = extensionContext.extensionPath;
}

export function execChildProcess(process: string, workingDirectory: string, channel?: vscode.OutputChannel) {
  return new Promise<string>((resolve, reject) => {
    child_process.exec(
      process,
      { cwd: workingDirectory, maxBuffer: 500 * 1024 },
      (error: Error, stdout: string, stderr: string) => {
        if (channel) {
          let message = '';
          let err = false;
          if (stdout && stdout.length > 0) {
            message += stdout;
          }

          if (stderr && stderr.length > 0) {
            message += stderr;
            err = true;
          }

          if (error) {
            message += error.message;
            err = true;
          }

          if (err) {
            channel.append(message);
            channel.show();
          }
        }

        if (error) {
          reject(error);
          return;
        }

        if (stderr && stderr.length > 0) {
          reject(new Error(stderr));
          return;
        }

        resolve(stdout);
      }
    );
  });
}

export function resolveExtensionFile(...segments: string[]) {
  return vscode.Uri.file(path.join(extensionPath, ...segments));
}

export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Splits string by popular separator symbols: '-', '.', ':' and space
 * @param str - project name, project key, folder name, workspace name
 */
export function tokenizeString(str: string): string[] {
  const tokens = str.split(/[-.: ]/);
  return tokens.map(t => t.toLowerCase());
}

export function getServerType(connection: BaseConnection): ServerType {
  return 'serverUrl' in connection ? 'SonarQube' : 'SonarCloud';
}

export function getDisplayName(connection: BaseConnection): string {
  if (connection.connectionId) {
    return connection.connectionId;
  }
  return getServerUrlOrOrganizationKey(connection);
}

export function getServerUrlOrOrganizationKey(connection: BaseConnection) {
  const serverType = getServerType(connection);
  if (serverType === 'SonarQube') {
    return (connection as SonarQubeConnection).serverUrl;
  }
  return (connection as SonarCloudConnection).organizationKey;
}

export function buildBaseServerUrl(serverType: ServerType, serverUrlOrOrganizationKey: string) {
  return serverType === 'SonarQube'
    ? `${serverUrlOrOrganizationKey}/dashboard`
    : 'https://sonarcloud.io/project/overview';
}
