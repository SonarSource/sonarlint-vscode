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

const isWindows = process.platform.indexOf('win') === 0;
const JAVA_FILENAME = 'java' + (isWindows ? '.exe' : '');

export interface RequirementsData {
  java_home: string;
  java_version: number;
}

interface ErrorData {
  message: string;
  label: string;
  openUrl: Uri;
  replaceClose: boolean;
}

export async function resolveRequirements(): Promise<RequirementsData> {
  let java_home = await checkJavaRuntime();
  let javaVersion = await checkJavaVersion(java_home);
  return Promise.resolve({ java_home: java_home, java_version: javaVersion });
}

function checkJavaRuntime(): Promise<any> {
  return new Promise((resolve, reject) => {
    let source: string;
    let javaHome: string = readJavaConfig();
    if (javaHome) {
      source = "The 'sonarlint.ls.javaHome' variable defined in VS Code settings";
    } else {
      javaHome = process.env['JDK_HOME'];
      if (javaHome) {
        source = 'The JDK_HOME environment variable';
      } else {
        javaHome = process.env['JAVA_HOME'];
        source = 'The JAVA_HOME environment variable';
      }
    }
    if (javaHome) {
      javaHome = expandHomeDir(javaHome);
      if (!pathExists.sync(javaHome)) {
        openJREDownload(reject, source + ' points to a missing folder');
      }
      if (!pathExists.sync(path.resolve(javaHome, 'bin', JAVA_FILENAME))) {
        openJREDownload(reject, source + ' does not point to a JRE.');
      }
      return resolve(javaHome);
    }
    //No settings, let's try to detect as last resort.
    findJavaHome(function(err, home) {
      if (err) {
        openJREDownload(
          reject,
          "Java runtime could not be located. Install it and set its location using 'sonarlint.ls.javaHome' variable in VS Code settings."
        );
      } else {
        resolve(home);
      }
    });
  });
}

function readJavaConfig(): string {
  const config = workspace.getConfiguration();
  return config.get<string>('sonarlint.ls.javaHome', null);
}

function checkJavaVersion(java_home: string): Promise<any> {
  return new Promise((resolve, reject) => {
    cp.execFile(java_home + '/bin/java', ['-version'], {}, (error, stdout, stderr) => {
      const javaVersion = parseMajorVersion(stderr);
      if (javaVersion < 8) {
        openJREDownload(
          reject,
          'Java 8 or more recent is required to run. Please download and install a recent JRE.'
        );
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
  //Ignore '1.' prefix for legacy Java versions
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
  const jreUrl = 'http://www.oracle.com/technetwork/java/javase/downloads/index.html';
  reject({
    message: cause,
    label: 'Get the Java Runtime Environment',
    openUrl: Uri.parse(jreUrl),
    replaceClose: false
  });
}
