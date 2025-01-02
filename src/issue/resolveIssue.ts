/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

'use strict';

import { QuickPickItem} from 'vscode';
import { MultiStepInput } from '../util/multiStepInput';
import { IssueService } from './issue';
import { showChangeStatusConfirmationDialog } from '../util/showMessage';
import { logToSonarLintOutput } from '../util/logging';


export async function resolveIssueMultiStepInput(
  workspaceFolderUri: string,
  issueKey: string,
  fileUri: string,
  isTaintIssue: boolean) {

  interface State {
    title: string;
    step: number;
    totalSteps: number;
    transitionState: QuickPickItem | string;
    comment: string;
  }

  const title = 'Resolve Issue';

  async function resolveIssue(input: MultiStepInput, state: Partial<State>) {
    const response = await IssueService.instance.checkIssueStatusChangePermitted(workspaceFolderUri, issueKey);
    if (!response.permitted) {
      logToSonarLintOutput(`Issue status change is not permitted: ${response.notPermittedReason}`);
    }
    const allowedStatuses: QuickPickItem[] = response.allowedStatuses.map(label => ({ label }));
    const pickedIssueStatus = await pickIssueStatus(input, title, allowedStatuses);
    if (pickedIssueStatus) {
      const comment = await inputComment(input, state);
      showChangeStatusConfirmationDialog('issue').then(async answer => {
        if (answer === 'Yes') {
          await IssueService.instance.changeIssueStatus(workspaceFolderUri, issueKey, pickedIssueStatus.label, fileUri, comment, isTaintIssue);
        }
      });
    }
  }

  async function inputComment(input: MultiStepInput, state: Partial<State>) {
    state.comment = await input.showInputBox({
      title,
      step: 2,
      totalSteps: 2,
      value: typeof state.transitionState === 'string' ? state.transitionState : '',
      prompt: 'Consider providing a reason for muting the issue (leave empty for not adding a new comment)'
    });
    return state.comment;
  }

  async function pickIssueStatus(input: MultiStepInput,
                                 title: string,
                                 resolveTransitions: QuickPickItem[]): Promise<QuickPickItem> {
    return await input.showQuickPick({
      title,
      step: 1,
      totalSteps: 2,
      placeholder: 'Choose a resolution status for the issue',
      items: resolveTransitions
    });
  }

  const state = {} as Partial<State>;
  await MultiStepInput.run(input => resolveIssue(input, state));
}
