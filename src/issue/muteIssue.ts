/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

'use strict';

import { QuickPickItem, window } from 'vscode';
import { MultiStepInput } from '../util/multiStepInput';
import { IssueService } from './issue';


const WONT_FIX_STATUS = 'Won\'t fix';
const FALSE_POSITIVE_STATUS = 'False positive';
export const MUTE_TRANSITION_STATES: QuickPickItem[] = [WONT_FIX_STATUS, FALSE_POSITIVE_STATUS]
  .map(label => ({ label }));

export async function muteIssueMultiStepInput(
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

  const title = 'Mute Issue';

  async function muteIssue(input: MultiStepInput, state: Partial<State>) {
    const pickedIssueStatus = await pickIssueStatus(input, title, MUTE_TRANSITION_STATES);
    if (pickedIssueStatus) {
      const comment = await inputComment(input, state);
      window.showInformationMessage('Do you want to do this?', {
          modal: true,
          detail: 'This action will change the status of the issue on the SonarQube/SonarCloud ' +
            'instance and will impact the Quality Gate'
        },
        'Yes')
        .then(async answer => {
          if (answer === 'Yes') {
            const newIssueStatus = translateQuickPickToIssueStatus(pickedIssueStatus);
            IssueService.instance.changeIssueStatus(workspaceUri, issueKey, newIssueStatus, fileUri, isTaintIssue)
              .then(()=>{
                if (comment) {
                  IssueService.instance.addComment(workspaceUri, issueKey, comment);
                }
              });
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
                                 muteTransitions: QuickPickItem[]): Promise<QuickPickItem> {
    return await input.showQuickPick({
      title,
      step: 1,
      totalSteps: 2,
      placeholder: 'Choose a resolution status for the issue',
      items: muteTransitions
    });
  }

  const state = {} as Partial<State>;
  await MultiStepInput.run(input => muteIssue(input, state));
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