/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2019 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

// Highly inspired from https://github.com/redhat-developer/vscode-java/blob/1f6783957c699e261a33d05702f2da356017458d/src/requirements.ts
'use strict';

import { workspace, Uri } from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as pathExists from 'path-exists';
import * as expandHomeDir from 'expand-home-dir';
import * as findJavaHome from 'find-java-home';
import { Commands } from './commands';

const isWindows = process.platform.indexOf('win') === 0;
const JAVA_FILENAME = 'java' + (isWindows ? '.exe' : '');
const JAVA_HOME_CONFIG = 'sonarlint.ls.javaHome';

export interface RequirementsData {
  javaHome: string;
  javaVersion: number;
}

interface ErrorData {
  message: string;
  label: string;
  command: string;
  commandParam: any;
}

export async function resolveRequirements(): Promise<RequirementsData> {
  const javaHome = await checkJavaRuntime();
  const javaVersion = await checkJavaVersion(javaHome);
  return Promise.resolve({ javaHome, javaVersion });
}

function checkJavaRuntime(): Promise<string> {
  return new Promise((resolve, reject) => {
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
      return resolve(javaHome);
    }
    //No settings, let"s try to detect as last resort.
    findJavaHome((err, home) => {
      if (err) {
        openJREDownload(
          reject,
          `Java runtime could not be located. Install it and set its location using "${JAVA_HOME_CONFIG}" variable in VS Code settings.`
        );
      } else {
        resolve(home);
      }
    });
  });
}

function readJavaConfig(): string {
  const config = workspace.getConfiguration();
  return config.get<string>(JAVA_HOME_CONFIG, null);
}

function checkJavaVersion(javaHome: string): Promise<number> {
  return new Promise((resolve, reject) => {
    cp.execFile(javaHome + '/bin/java', ['-version'], {}, (error, stdout, stderr) => {
      const javaVersion = parseMajorVersion(stderr);
      if (javaVersion < 8) {
        openJREDownload(reject, 'Java 8 or more recent is required to run. Please download and install a recent JRE.');
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

function openJREDownload(reject, cause) {
  const jreUrl = 'https://www.oracle.com/technetwork/java/javase/downloads/index.html';
  reject({
    message: cause,
    label: 'Get the Java Runtime Environment',
    command: Commands.OPEN_BROWSER,
    commandParam: Uri.parse(jreUrl)
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
