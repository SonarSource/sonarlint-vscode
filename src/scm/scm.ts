/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as ChildProcess from 'child_process';
import * as vscode from 'vscode';
import { API, GitExtension, Repository } from './git';
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
        if(state === 'initialized') {
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
  } catch(e) {
    logToSonarLintOutput(`Exception occurred while initializing the Git API: ${e}`);
    return new NoopScm();
  }
}

enum GitReturnCode {
  E_OK = 0,
  E_FAIL = 1,
  E_INVALID = 128
}

function isNeitherOkNorFail(code?: GitReturnCode) {
  return [GitReturnCode.E_OK, GitReturnCode.E_FAIL].indexOf(code) < 0;
}

async function isIgnored(workspaceFolderPath: string, gitCommand: string): Promise<boolean> {
  const { sout, serr } = await new Promise<{ sout: string; serr: string }>((resolve, reject) => {
    ChildProcess.exec(
      gitCommand,
      { cwd: workspaceFolderPath },
      (error: Error & { code?: GitReturnCode }, stdout, stderr) => {
        if (error && isNeitherOkNorFail(error.code)) {
          if (isVerboseEnabled()) {
            logToSonarLintOutput(`Error on git command "${gitCommand}": ${error}`);
          }
          reject(error);
          return;
        }
        resolve({ sout: stdout, serr: stderr });
      }
    );
  });

  if (serr) {
    return Promise.resolve(false);
  }

  return Promise.resolve(sout.length > 0);
}

export async function isIgnoredByScm(fileUri: string): Promise<boolean> {
  return performIsIgnoredCheck(fileUri, isIgnored);
}

export async function performIsIgnoredCheck(
  fileUri: string,
  scmCheck: (workspaceFolderPath: string, gitCommand: string) => Promise<boolean>
): Promise<boolean> {
  const parsedFileUri = vscode.Uri.parse(fileUri);
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(parsedFileUri);
  if (workspaceFolder == null) {
    logToSonarLintOutput(`The '${fileUri}' file is not in the workspace, consider as not ignored`);
    return Promise.resolve(false);
  }
  const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git').exports;
  if (gitExtension == null) {
    logToSonarLintOutput(`The git extension is not installed, consider the '${fileUri}' file as not ignored`);
    return Promise.resolve(false);
  }
  try {
    const gitApi = gitExtension.getAPI(1);
    const gitPath = gitApi.git.path;
    const repo = gitApi.getRepository(parsedFileUri);
    if (repo) {
      // use the absolute file path, Git is able to manage
      const command = `"${gitPath}" check-ignore "${parsedFileUri.fsPath}"`;
      const fileIgnoredForFolder = await scmCheck(repo.rootUri.fsPath, command);
      return Promise.resolve(fileIgnoredForFolder);
    } else {
      logToSonarLintOutput(`The '${fileUri}' file is not in a git repo, consider as not ignored`);
      return Promise.resolve(false);
    }
  } catch (e) {
    logToSonarLintOutput(`Error requesting ignored status, consider the '${fileUri}' file as not ignored`);
    return Promise.resolve(false);
  }
}
