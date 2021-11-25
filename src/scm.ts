/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2021 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import { API, GitExtension, Repository } from './git';
import { SonarLintExtendedLanguageClient } from './client';
import { logToSonarLintOutput } from './extension';

const GIT_EXTENSION_ID = 'vscode.git';
const GIT_API_VERSION = 1;

export interface Scm {
  dispose(): void;
}

class NoopScm implements Scm {
  dispose() {
    // NOP
  }
}

class GitScm implements Scm {

  constructor(private readonly gitApi: API, private readonly client: SonarLintExtendedLanguageClient) {
    gitApi.onDidOpenRepository(r => {
      logToSonarLintOutput('Registering from open repo handler');
      this.subscribeToRepositoryChanges(r);
    });
    if (gitApi.state === 'initialized') {
      logToSonarLintOutput('Registering from state === initialized at startup');
      this.subscribeToAllRepositoryChanges();
    } else {
      gitApi.onDidChangeState(state => {
        if(state === 'initialized') {
          logToSonarLintOutput('Registering from state ==> initialized');
          this.subscribeToAllRepositoryChanges();
        }
      });
    }
  }

  private subscribeToAllRepositoryChanges() {
    this.gitApi.repositories.forEach(this.subscribeToRepositoryChanges, this);
  }

  private subscribeToRepositoryChanges(repository: Repository) {
    logToSonarLintOutput(`Starting to watch SCM events for ${repository.rootUri}`);
    logToSonarLintOutput(`this: ${this} / this.client: ${this.client}`);
    repository.state.onDidChange(e => {
      vscode.workspace.workspaceFolders.forEach(folder => {
        if (folder.uri.toString().startsWith(repository.rootUri.toString())) {
          logToSonarLintOutput(`Repository ${repository.rootUri} is now on branch ${repository.state.HEAD.name}`);
          logToSonarLintOutput(`this: ${this} / this.client: ${this.client}`);
          this.client.didLocalBranchNameChange(folder.uri, repository.state.HEAD.name);
        }
      });
    });
  }

  dispose() {
    // ???
  }
}

export function initScm(client: SonarLintExtendedLanguageClient) {
  try {
    const gitApi = vscode.extensions.getExtension<GitExtension>(GIT_EXTENSION_ID).exports?.getAPI(GIT_API_VERSION);
    return new GitScm(gitApi, client);
  } catch(e) {
    logToSonarLintOutput(`Exception occurred while initializing the Git API: ${e}`);
    return new NoopScm();
  }
}

