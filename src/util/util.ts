/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as child_process from 'child_process';
import * as path from 'path';
import * as process from 'process';
import { TextDecoder } from 'util';
import * as vscode from 'vscode';
import { AnalysisFile } from '../lsp/protocol';
import { code2ProtocolConverter } from './uri';
import { verboseLogToSonarLintOutput } from './logging';

export function startedInDebugMode(process: NodeJS.Process): boolean {
  const args = process.execArgv;
  if (args) {
    return args.some(arg => /^--debug=?/.test(arg) || /^--debug-brk=?/.test(arg) || /^--inspect-brk=?/.test(arg));
  }
  return false;
}

export const extension = vscode.extensions.getExtension('SonarSource.sonarlint-vscode');
export const packageJson = extension.packageJSON;
export const HOTSPOTS_FULL_SCAN_FILE_SIZE_LIMIT_BYTES = 500_000;

export let extensionPath: string;
export let extensionContext: vscode.ExtensionContext;

export function setExtensionContext(context: vscode.ExtensionContext): void {
  extensionContext = context;
  extensionPath = extensionContext.extensionPath;
}

export function isRunningOnWindows() {
  return /^win32/.test(process.platform);
}

export function isRunningAutoBuild() {
  return process.env.NODE_ENV === 'continuous-integration';
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

export function formatIssueMessage(message: string, ruleKey: string) {
  return new vscode.MarkdownString(`$(warning) ${message} \`sonarlint(${ruleKey})\``, true);
}

export async function findFilesInFolder(
  uri: vscode.Uri,
  cancelToken: vscode.CancellationToken
): Promise<vscode.Uri[]> {
  if (cancelToken.isCancellationRequested) {
    return [];
  }
  const filesInFolder = await vscode.workspace.fs.readDirectory(uri);
  let myFiles = [];
  for (const [name, type] of filesInFolder) {
    const fileUri = vscode.Uri.joinPath(uri, name);
    if (type === vscode.FileType.Directory) {
      const childFiles = await findFilesInFolder(fileUri, cancelToken);
      myFiles = myFiles.concat(childFiles);
    } else if (type === vscode.FileType.File) {
      myFiles.push(fileUri);
    }
  }
  return myFiles;
}

export async function createAnalysisFilesFromFileUris(
  fileUris: vscode.Uri[],
  openDocuments: vscode.TextDocument[],
  progress: vscode.Progress<{
    message?: string;
    increment?: number;
  }>,
  cancelToken: vscode.CancellationToken
): Promise<AnalysisFile[]> {
  if (cancelToken.isCancellationRequested) {
    return [];
  }
  const openedFileUrisToDocuments = new Map<string, vscode.TextDocument>();
  openDocuments.forEach(d => openedFileUrisToDocuments.set(d.uri.path, d));
  const filesRes: AnalysisFile[] = [];
  const totalFiles = fileUris.length;
  let currentFile = 0;
  for (const fileUri of fileUris) {
    if (cancelToken.isCancellationRequested) {
      return [];
    }
    currentFile += 1;
    progress.report({increment: 50.0 * currentFile / totalFiles});
    const fileStat = await vscode.workspace.fs.stat(fileUri);
    if (fileStat.size > HOTSPOTS_FULL_SCAN_FILE_SIZE_LIMIT_BYTES) {
      verboseLogToSonarLintOutput(`File will not be analysed because it's too large: ${fileUri.path}`);
      continue;
    }
    let fileContent;
    let version;
    const filePath = fileUri.path;
    if (openedFileUrisToDocuments.has(filePath)) {
      const openedDocument = openedFileUrisToDocuments.get(filePath);
      fileContent = openedDocument.getText();
      version = openedDocument.version;
    } else {
      const contentArray = await vscode.workspace.fs.readFile(fileUri);
      fileContent = new TextDecoder().decode(contentArray);
      version = 1;
    }
    filesRes.push({
      uri: code2ProtocolConverter(fileUri),
      languageId: '[unknown]',
      version,
      text: fileContent
    });
  }
  return filesRes;
}

export function getQuickPickListItemsForWorkspaceFolders(
  workspaceFolders: readonly vscode.WorkspaceFolder[]): vscode.QuickPickItem[] {
  const quickPickItems: vscode.QuickPickItem[] = [];
  for (const workspaceFolder of workspaceFolders) {
    quickPickItems.push({
      label: workspaceFolder.name,
      description: workspaceFolder.uri.path
    });
  }
  return quickPickItems;
}

export function globPatternToRegex(globPattern: string): RegExp {
  const commonSuffixGlobFormat = /^\*\*\/\*\.[a-z0-9]{1,6}$/;
  if (commonSuffixGlobFormat.test(globPattern)) {
    const offsetForCommonGlobFormat = 5;
    const suffix = globPattern.substring(offsetForCommonGlobFormat);
    const regexStr = `\\.${suffix}$`;
    return new RegExp(regexStr);
  }
  const str = String(globPattern);
  let regex = '';
  const charsToEscape = new Set(['.', '+', '/', '|', '$', '^', '(', ')', '=', '!', ',']);
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (charsToEscape.has(c)) {
      regex += '\\' + c;
    } else if (c === '*') {
      const prev = str[i - 1];
      let asteriskCount = 1;
      while (str[i + 1] === '*') {
        asteriskCount++;
        i++;
      }
      const next = str[i + 1];
      const dirMatcher = isDirMatcher(asteriskCount, prev, next);
      if (dirMatcher) {
        regex += '((?:[^/]*(?:/|$))*)';
        i++;
      } else {
        regex += '([^/]*)';
      }
    } else {
      regex += c;
    }
  }
  regex = `^${regex}$`;
  return new RegExp(regex);
}

export function getFilesMatchedGlobPatterns(allFiles: vscode.Uri[], globPatterns: string[]): vscode.Uri[] {
  const masterRegex = getMasterRegex(globPatterns);
  return allFiles.filter(f => masterRegex.test(f.path));
}

export function getFilesNotMatchedGlobPatterns(allFiles: vscode.Uri[], globPatterns: string[]): vscode.Uri[] {
  const masterRegex = getMasterRegex(globPatterns);
  return allFiles.filter(f => !masterRegex.test(f.path));
}

function isDirMatcher(asteriskCount: number, prev: string, next: string): boolean {
  return asteriskCount > 1 && (prev === '/' || prev === undefined) && (next === '/' || next === undefined);
}

export function getMasterRegex(globPatterns: string[]) {
  const regexes = globPatterns.map(p => globPatternToRegex(p).source);
  return new RegExp(regexes.join('|'), 'i');
}

export function getIdeFileExclusions(excludes): string[] {
  const excludedPatterns: string[] = [];
  for (const pattern in excludes) {
    const isExcluded = excludes[pattern];
    if (isExcluded) {
      excludedPatterns.push(pattern);
    }
  }
  return excludedPatterns;
}
