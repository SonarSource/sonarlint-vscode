/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

// Highly inspired from https://github.com/redhat-developer/vscode-java/blob/1f6783957c699e261a33d05702f2da356017458d/src/requirements.ts
'use strict';

import * as cp from 'child_process';
import * as expandHomeDir from 'expand-home-dir';
import * as findJavaHome from 'find-java-home';
import * as path from 'path';
import * as pathExists from 'path-exists';
import * as vscode from 'vscode';
import { Commands } from './commands';
import * as jre from './jre';
import { PlatformInformation } from './platform';
import * as util from './util';
import * as fse from 'fs-extra';



const REQUIRED_JAVA_VERSION = 11;

const isWindows = process.platform.indexOf('win') === 0;
const JAVA_FILENAME = `java${isWindows ? '.exe' : ''}`;
export const JAVA_HOME_CONFIG = 'sonarlint.ls.javaHome';

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
  const jreDir = path.join(context.extensionPath, 'jre');
  let javaHome;
  if (fse.existsSync(jreDir) && fse.statSync(jreDir).isDirectory()) {
    const dirs = fse.readdirSync(jreDir);
    const javaDir = dirs[0];
    javaHome = path.join(jreDir, javaDir);
  } else {
    javaHome = await checkJavaRuntime();
  }
  const javaVersion = await checkJavaVersion(javaHome);
  return { javaHome, javaVersion };
}

function checkJavaRuntime(): Promise<string> {
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

    // No settings let's try to detect
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
    const javaExec = path.join(javaHome, 'bin', 'java');
    cp.execFile(javaExec, ['-version'], {}, (error, stdout, stderr) => {
      const javaVersion = parseMajorVersion(stderr);
      if (javaVersion < REQUIRED_JAVA_VERSION) {
        openJREDownload(reject, `Java ${REQUIRED_JAVA_VERSION} or more recent is required to run.
Please download and install a recent JRE.`);
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
  const legacyPrefix = '1.';
  if (version.startsWith(legacyPrefix)) {
    version = version.substring(legacyPrefix.length);
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
    message: `The Java Runtime Environment can not be located. Please install a JRE, or configure its path with the
      ${JAVA_HOME_CONFIG} property. You can also let SonarLint download the JRE from AdoptOpenJDK. This JRE will be
      used only by SonarLint.`,
    label: 'Let SonarLint download the JRE',
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

async function findEmbeddedJRE(context: vscode.ExtensionContext): Promise<string | undefined> {
  const jreHome = context.asAbsolutePath('jre');
  if (fse.existsSync(jreHome) && fse.statSync(jreHome).isDirectory()) {
    const candidates = fse.readdirSync(jreHome);
    for (const candidate of candidates) {
      if (fse.existsSync(path.join(jreHome, candidate, 'bin', JAVA_FILENAME))) {
        return path.join(jreHome, candidate);
      }
    }
  }
  return Promise.resolve(undefined);
}

export function installManagedJre() {
  return vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'SonarLint JRE Install' },
    (progress, cancelToken) => {
      return PlatformInformation.GetPlatformInformation()
        .then(platformInfo => {
          const options = {
            os: platformInfo.os as jre.Os,
            architecture: platformInfo.arch as jre.Architecture,
            version: REQUIRED_JAVA_VERSION as jre.Version
          };
          progress.report({ message: 'Downloading' });
          return jre.download(options, path.join(util.extensionPath, '..', 'sonarsource.sonarlint_managed-jre'));
        })
        .then(downloadResponse => {
          progress.report({ message: 'Uncompressing' });
          return jre.unzip(downloadResponse);
        })
        .then(jreInstallDir => {
          progress.report({ message: 'Done' });
          vscode.workspace
            .getConfiguration('sonarlint.ls')
            .update('javaHome', jreInstallDir, vscode.ConfigurationTarget.Global);
        })
        .catch(err => {
          throw err;
        });
    }
  );
}
