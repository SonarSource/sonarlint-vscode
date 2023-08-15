/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

'use strict';

import { QuickPickItem} from 'vscode';
import { MultiStepInput } from '../util/multiStepInput';
import { IssueService } from './issue';
import { showChangeStatusConfirmationDialog } from '../util/showMessage';


const WONT_FIX_STATUS = 'Won\'t fix';
const FALSE_POSITIVE_STATUS = 'False positive';
export const RESOLVE_TRANSITION_STATES: QuickPickItem[] = [WONT_FIX_STATUS, FALSE_POSITIVE_STATUS]
  .map(label => ({ label }));

export async function resolveIssueMultiStepInput(
  workspaceUri: string,
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
    const pickedIssueStatus = await pickIssueStatus(input, title, RESOLVE_TRANSITION_STATES);
    if (pickedIssueStatus) {
      const comment = await inputComment(input, state);
      showChangeStatusConfirmationDialog('issue').then(async answer => {
        if (answer === 'Yes') {
          const newIssueStatus = translateQuickPickToIssueStatus(pickedIssueStatus);
          await IssueService.instance.changeIssueStatus(workspaceUri, issueKey, newIssueStatus, fileUri, comment, isTaintIssue);
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

export function translateQuickPickToIssueStatus(item: QuickPickItem) {
  switch (item.label) {
    case WONT_FIX_STATUS: {
      return 'WONT_FIX';
    }
    case FALSE_POSITIVE_STATUS: {
      return 'FALSE_POSITIVE';
    }
    default: {
      throw new Error(`Could not find issue status '${item.label}'`);
    }
  }
}