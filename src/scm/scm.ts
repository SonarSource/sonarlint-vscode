/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as ChildProcess from 'child_process';
import * as vscode from 'vscode';
import * as path from 'path';
import * as _ from 'underscore';
import { API, GitErrorCodes, GitExtension, Repository } from './git';
import { SonarLintExtendedLanguageClient } from '../lsp/client';
import { isVerboseEnabled } from '../settings/settings';
import { logToSonarLintOutput } from '../util/logging';

const GIT_EXTENSION_ID = 'vscode.git';
const GIT_API_VERSION = 1;

interface Scm extends vscode.Disposable {
  getBranchForFolder(folderUri: vscode.Uri): string|null;
  setReferenceBranchName(folderUri: vscode.Uri, branchName?: string): void;
  getReferenceBranchNameForFile(fileUri: vscode.Uri): string|null;
  updateReferenceBranchStatusItem(event?: vscode.TextEditor): void;
}

class NoopScm implements Scm {

  getBranchForFolder(folderUri: vscode.Uri) {
    return null;
  }

  setReferenceBranchName(folderUri: vscode.Uri, branchName?: string) {
    // NOP
  }

  getReferenceBranchNameForFile(fileUri: vscode.Uri) {
    return null;
  }

  updateReferenceBranchStatusItem(event?: vscode.TextEditor) {
    // NOP
  }

  dispose() {
    // NOP
  }
}

class GitScm implements Scm {

  private readonly listeners: Array<vscode.Disposable>;

  private readonly localBranchByFolderUri: Map<string, string>;

  private readonly referenceBranchByFolderUri: Map<string, string>;

  constructor(
    private readonly gitApi: API,
    private readonly client: SonarLintExtendedLanguageClient,
    private readonly referenceBranchStatusItem: vscode.StatusBarItem) {
    this.listeners = [
      gitApi.onDidOpenRepository(r => {
        this.subscribeToRepositoryChanges(r);
      })
    ];
    this.localBranchByFolderUri = new Map<string, string>();
    this.referenceBranchByFolderUri = new Map<string, string>();
    if (gitApi.state === 'initialized') {
      this.subscribeToAllRepositoryChanges();
    } else {
      gitApi.onDidChangeState(state => {
        if (state === 'initialized') {
          this.subscribeToAllRepositoryChanges();
        }
      });
    }
  }

  getBranchForFolder(folderUri: vscode.Uri) {
    return this.gitApi.getRepository(folderUri).state.HEAD?.name;
  }

  private subscribeToAllRepositoryChanges() {
    this.gitApi.repositories.forEach(this.subscribeToRepositoryChanges, this);
    vscode.workspace.workspaceFolders?.forEach(folder => {
      const branchName = this.gitApi.getRepository(folder.uri)?.state.HEAD?.name;
      logToSonarLintOutput(`Initializing ${folder.uri} on branch ${branchName}`);
      this.localBranchByFolderUri.set(folder.uri.toString(), branchName);
      this.client.didLocalBranchNameChange(folder.uri, branchName);
    });
  }

  private subscribeToRepositoryChanges(repository: Repository) {
    this.listeners.push(repository.state.onDidChange(() => {
      vscode.workspace.workspaceFolders?.forEach(folder => {
        const folderUriAsString = folder.uri.toString();
        if (folderUriAsString.startsWith(repository.rootUri.toString())) {
          const branchName = repository.state.HEAD?.name;
          if (this.localBranchByFolderUri.get(folderUriAsString) !== branchName) {
            logToSonarLintOutput(`Folder ${folder.uri} is now on branch ${branchName}`);
            this.client.didLocalBranchNameChange(folder.uri, branchName);
          }
        }
      });
    }));
  }

  setReferenceBranchName(folderUri: vscode.Uri, branchName?: string) {
    this.referenceBranchByFolderUri.set(folderUri.toString(true), branchName);
    this.updateReferenceBranchStatusItem(vscode.window.activeTextEditor);
  }

  getReferenceBranchNameForFile(fileUri?: vscode.Uri) {
    if (fileUri) {
      const workspaceFolderForFile = vscode.workspace.getWorkspaceFolder(fileUri);
      return this.referenceBranchByFolderUri.get(workspaceFolderForFile?.uri?.toString(true));
    } else {
      return null;
    }
  }

  updateReferenceBranchStatusItem(event?: vscode.TextEditor) {
    const referenceBranchName = this.getReferenceBranchNameForFile(event?.document?.uri);
    if (referenceBranchName) {
      this.referenceBranchStatusItem.text = `SonarLint branch: ${referenceBranchName}`;
      this.referenceBranchStatusItem.show();
    } else {
      this.referenceBranchStatusItem.hide();
    }
  }

  dispose() {
    this.listeners.forEach(d => {
      try {
        d.dispose();
      } catch (e) {
        // Ignored during dispose
      }
    });
  }
}

export function initScm(client: SonarLintExtendedLanguageClient, referenceBranchStatusItem: vscode.StatusBarItem) {
  try {
    const gitApi = vscode.extensions.getExtension<GitExtension>(GIT_EXTENSION_ID).exports?.getAPI(GIT_API_VERSION);
    return new GitScm(gitApi, client, referenceBranchStatusItem);
  } catch (e) {
    logToSonarLintOutput(`Exception occurred while initializing the Git API: ${e}`);
    return new NoopScm();
  }
}

export async function isIgnoredByScm(fileUri: string): Promise<boolean> {
  return await isFileIgnoredByScm(fileUri, filterIgnored);
}

export async function isFileIgnoredByScm(
  fileUri: string,
  scmCheck: (gitPath: string, gitArgs: string[], workspaceFolderPath: string,
             fileUris: vscode.Uri[]) => Promise<vscode.Uri[]>): Promise<boolean> {
  const parsedFileUri = vscode.Uri.parse(fileUri);
  const notIgnoredFiles = await filterOutScmIgnoredFiles([parsedFileUri], scmCheck);
  return notIgnoredFiles.length === 0;
}

export async function filterOutScmIgnoredFiles(
  fileUris: vscode.Uri[],
  scmCheck: (gitPath: string, gitArgs: string[], workspaceFolderPath: string,
             fileUris: vscode.Uri[]) => Promise<vscode.Uri[]>): Promise<vscode.Uri[]> {
  const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git').exports;
  if (gitExtension == null) {
    logToSonarLintOutput(`The git extension is not installed, consider all files not ignored`);
    return Promise.resolve(fileUris);
  }
  try {
    let notIgnoredFiles = [];
    const gitApi = gitExtension.getAPI(1);
    const gitPath = gitApi.git.path;
    // assume all files are from the same git repo
    const firstFileUri = fileUris[0];
    const repo = gitApi.getRepository(firstFileUri);
    if (!repo) {
      logToSonarLintOutput(`There is no git repository, consider all files as not ignored`);
      return Promise.resolve(fileUris);
    }
    const repoFsPath = repo.rootUri.fsPath;
    let filesInsideSubmodules = [];
    let filesOutsideSubmodules = fileUris;

    const submodulesPaths = await getSubmodulesPaths(gitPath, repoFsPath);
    if (submodulesPaths) {
      const fileGroups = _.groupBy(fileUris, function(fileUri: vscode.Uri) {
        return submodulesPaths.some(submodulePath => fileUri.path.includes(submodulePath));
      });
      filesInsideSubmodules = fileGroups.true;
      filesOutsideSubmodules = fileGroups.false;
      notIgnoredFiles =
        await notIgnoredFilesFromSubmodules(submodulesPaths, filesInsideSubmodules, repoFsPath, scmCheck, gitPath);
    }
    const checkIgnoreArgs = ['check-ignore', '-v', '-z', '--stdin'];
    const notIgnoredFilesOutsideSubmodules =
      await scmCheck(gitPath, checkIgnoreArgs, repoFsPath, filesOutsideSubmodules);
    notIgnoredFiles = notIgnoredFiles.concat(notIgnoredFilesOutsideSubmodules);
    return notIgnoredFiles;
  } catch (e) {
    logToSonarLintOutput(`Error requesting ignored status, consider all files not ignored: \n ${e}`);
    return Promise.resolve(fileUris);
  }
}

export async function notIgnoredFilesFromSubmodules(
  submodulesPaths: string[], filesInsideSubmodules: vscode.Uri[], repoFsPath: string,
  scmCheck: (gitPath: string, gitArgs: string[], workspaceFolderPath: string,
             fileUris: vscode.Uri[]) => Promise<vscode.Uri[]>,
  gitPath: string): Promise<vscode.Uri[]> {
  let notIgnoredFiles = [];
  const checkIgnoreArgs = ['check-ignore', '-v', '-z', '--stdin'];

  for (const submodulePath of submodulesPaths) {
    const filesInSubmodule = filesInsideSubmodules.filter(fileUri => fileUri.path.includes(submodulePath));
    const submoduleRepoPath = getSubmoduleRepoPath(repoFsPath, submodulePath);
    const notIgnoredFilesInSubmodule = await scmCheck(gitPath, checkIgnoreArgs, submoduleRepoPath, filesInSubmodule);
    notIgnoredFiles = notIgnoredFiles.concat(notIgnoredFilesInSubmodule);
  }
  return notIgnoredFiles;
}
export function getSubmoduleRepoPath(repoFsPath: string, submodulePath: string) {
  return `${repoFsPath}${path.sep}${submodulePath}`;
}

export async function getSubmodulesPaths(gitPath: string, repoPath: string): Promise<string[]> {
  const gitArgs = ['config', '--file', '.gitmodules', '--get-regexp', 'path'];

  try {
    const result = await executeGitCommand(gitPath, gitArgs, repoPath, '\0');

    if (result.serr) {
      return Promise.resolve([]);
    }

    const raw = result.sout;
    return raw.split('\n').map(value => value.split(/\s/g)[1]).filter(value => value);
  } catch (e) {
    if (isVerboseEnabled()) {
      logToSonarLintOutput(`No submodules found in '${repoPath}' repository. Error: ${e}`);
    }
    return Promise.resolve([]);
  }
}

interface GitResponse {
  sout: string;
  serr: string;
}

async function executeGitCommand(
  gitPath: string,
  gitArgs: string[],
  workspaceFolderPath: string, stdIn): Promise<GitResponse> {
  return await new Promise<GitResponse>(
    (resolve, reject) => {
      const child = ChildProcess.spawn(
        gitPath,
        gitArgs,
        { cwd: workspaceFolderPath }
      );
      const onExit = (exitCode: number) => {
        if (exitCode === 1) {
          reject(stderr);
        } else if (exitCode === 0) {
          resolve({ sout: data, serr: stderr });
        } else {
          if (/ is in submodule /.test(stderr)) {
            reject({ stdout: data, stderr, exitCode, gitErrorCode: GitErrorCodes.IsInSubmodule });
          } else {
            reject({ stdout: data, stderr, exitCode });
          }
        }
      };
      let data = '';
      const onStdoutData = (raw: string) => {
        data += raw;
      };

      child.stdout.setEncoding('utf8');
      child.stdout.on('data', onStdoutData);

      child.stdin.end(stdIn, 'utf8');
      let stderr = '';
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', raw => stderr += raw);

      child.on('error', reject);
      child.on('exit', onExit);
    });
}

export async function filterIgnored(
  gitPath: string, gitArgs: string[], workspaceFolderPath: string,
  fileUris: vscode.Uri[]): Promise<vscode.Uri[]> {
  try {
    const stdIn = fileUris.map(it => it.fsPath).join('\0');
    const result = await executeGitCommand(gitPath, gitArgs, workspaceFolderPath, stdIn);
    if (result.serr) {
      return Promise.resolve(fileUris);
    }

    const ignoredFiles = parseIgnoreCheck(result.sout);
    const notIgnoredFiles = fileUris
      .filter(it => !ignoredFiles.has(it.fsPath));
    return Promise.resolve(notIgnoredFiles);
  } catch (e) {
    if (isVerboseEnabled()) {
      logToSonarLintOutput(`Error when detecting ignored files: ${e}`);
    }
    return Promise.resolve(fileUris);
  }
}

export function parseIgnoreCheck(raw: string): Set<string> {
  const ignored = new Set<string>();
  const elements = raw.split('\0');
  for (let i = 0; i < elements.length; i += 4) {
    const pattern = elements[i + 2];
    const path = elements[i + 3];
    if (pattern && !pattern.startsWith('!')) {
      ignored.add(path);
    }
  }
  return ignored;
}
