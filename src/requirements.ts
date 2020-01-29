/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2020 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

// Highly inspired from https://github.com/redhat-developer/vscode-java/blob/1f6783957c699e261a33d05702f2da356017458d/src/requirements.ts
'use strict';

import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as pathExists from 'path-exists';
import * as expandHomeDir from 'expand-home-dir';
import * as findJavaHome from 'find-java-home';

import { Commands } from './commands';
import * as jre from './jre';
import { PlatformInformation } from './platform';
import * as util from './util';

const isWindows = process.platform.indexOf('win') === 0;
const JAVA_FILENAME = `java${isWindows ? '.exe' : ''}`;
const JAVA_HOME_CONFIG = 'sonarlint.ls.javaHome';
const JAVA_MANAGED_HOME_KEY = 'managedHome';

export interface RequirementsData {
  javaHome: string;
  javaVersion: number;
}

interface ErrorData {
  message: string;
  label: string;
  command: string;
  commandParam: string | vscode.Uri;
}

export async function resolveRequirements(context: vscode.ExtensionContext): Promise<RequirementsData> {
  const javaHome = await checkJavaRuntime(context);
  const javaVersion = await checkJavaVersion(javaHome);
  return Promise.resolve({ javaHome, javaVersion });
}

function checkJavaRuntime(context: vscode.ExtensionContext): Promise<string> {
  return new Promise((resolve, reject) => {
    let { source, javaHome } = tryExplicitConfiguration();
    if (javaHome) {
      javaHome = expandHomeDir(javaHome);
      if (!pathExists.sync(javaHome)) {
        invalidJavaHome(reject, `The ${source} points to a missing or inaccessible folder (${javaHome})`);
      } else if (!pathExists.sync(path.resolve(javaHome, 'bin', JAVA_FILENAME))) {
        let msg: string;
        if (pathExists.sync(path.resolve(javaHome, JAVA_FILENAME))) {
          msg = `'bin' should be removed from the ${source} (${javaHome})`;
        } else {
          msg = `The ${source} (${javaHome}) does not point to a JRE.`;
        }
        invalidJavaHome(reject, msg);
      }
      resolve(javaHome);
    }
    // No settings, check if we have a managed one
    javaHome = context.globalState.get(JAVA_MANAGED_HOME_KEY, null);
    if (javaHome) {
      resolve(javaHome);
    }

    // No settings and no existing managed one, let's try to detect
    findJavaHome((err, home) => {
      if (err || !home) {
        // No Java detected, last resort is to ask for permission to download and manage our own
        suggestManagedJre(reject);
      } else {
        resolve(home);
      }
    });
  });
}

function tryExplicitConfiguration() {
  let source: string;
  let javaHome: string = readJavaConfig();
  if (javaHome) {
    source = `'${JAVA_HOME_CONFIG}' variable defined in VS Code settings`;
  } else {
    javaHome = process.env['JDK_HOME'];
    if (javaHome) {
      source = 'JDK_HOME environment variable';
    } else {
      javaHome = process.env['JAVA_HOME'];
      source = 'JAVA_HOME environment variable';
    }
  }
  return { source, javaHome: javaHome ? javaHome.trim() : null };
}

function readJavaConfig(): string {
  return vscode.workspace.getConfiguration().get<string>(JAVA_HOME_CONFIG, null);
}

function checkJavaVersion(javaHome: string): Promise<number> {
  return new Promise((resolve, reject) => {
    cp.execFile(`${javaHome}/bin/java`, ['-version'], {}, (error, stdout, stderr) => {
      const javaVersion = parseMajorVersion(stderr);
      if (javaVersion < 8) {
        util.extensionContext.globalState.update(JAVA_MANAGED_HOME_KEY, undefined).then(() =>
        openJREDownload(reject, 'Java 8 or more recent is required to run. Please download and install a recent JRE.'));
      } else {
        resolve(javaVersion);
      }
    });
  });
}

export function parseMajorVersion(content: string): number {
  let regexp = /version "(.*)"/g;
  let match = regexp.exec(content);
  if (!match) {
    return 0;
  }
  let version = match[1];
  //Ignore "1." prefix for legacy Java versions
  if (version.startsWith('1.')) {
    version = version.substring(2);
  }
  //look into the interesting bits now
  regexp = /\d+/g;
  match = regexp.exec(version);
  let javaVersion = 0;
  if (match) {
    javaVersion = parseInt(match[0]);
  }
  return javaVersion;
}

function suggestManagedJre(reject) {
  reject({
    message: `Java runtime could not be located. Do you want SonarLint to download and manage its own runtime?`,
    label: 'Use managed JRE',
    command: Commands.INSTALL_MANAGED_JRE
  });
}

function openJREDownload(reject, cause) {
  const jreUrl = 'https://www.oracle.com/technetwork/java/javase/downloads/index.html';
  reject({
    message: cause,
    label: 'Get the Java Runtime Environment',
    command: Commands.OPEN_BROWSER,
    commandParam: vscode.Uri.parse(jreUrl)
  });
}

function invalidJavaHome(reject, cause: string) {
  if (cause.indexOf(JAVA_HOME_CONFIG) > -1) {
    reject({
      message: cause,
      label: 'Open settings',
      command: Commands.OPEN_SETTINGS,
      commandParam: JAVA_HOME_CONFIG
    });
  } else {
    reject({
      message: cause
    });
  }
}

export async function installManagedJre() {
  return vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Downloading JRE' },
    async (progress, cancelToken) => {
      const platformInfo = await PlatformInformation.GetPlatformInformation();
      const options = {
        os: platformInfo.os as jre.Os,
        architecture: platformInfo.arch as jre.Architecture,
        version: 11 as jre.Version
      };
      return jre.download(options, path.join(util.extensionPath, '..', 'sonarsource.sonarlint_managed-jre'))
        .then((downloadResponse: any) => {
          progress.report({ message: 'Unzipping JRE' });
          return jre.unzip(downloadResponse.jreZipPath, downloadResponse.destinationDir, options);
        })
        .then(jreInstallDir => {
          progress.report({ message: 'JRE Installed' });
          util.extensionContext.globalState.update(JAVA_MANAGED_HOME_KEY, jreInstallDir).then(() => {
            const reload = 'Reload';
            vscode.window.showInformationMessage('Managed JRE is now installed, please reload to activate SonarLint', reload)
              .then((value: string) => {
                if (value === reload) {
                  vscode.commands.executeCommand('workbench.action.reloadWindow');
                }
            });
          });
        })
        .catch(err => {
          throw err;
        });
    }
  );
}
