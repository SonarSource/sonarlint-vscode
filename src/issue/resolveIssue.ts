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
import { IndexQP } from '../cfamily/cfamily';
import { DependencyRiskTransition } from '../findings/findingTypes/dependencyRiskNode';


export async function resolveIssueMultiStepInput(
  workspaceFolderUri: string,
  issueKey: string,
  fileUri: string,
  isTaintIssue: boolean,
  isDependencyRisk: boolean
) {

  interface State {
    title: string;
    step: number;
    totalSteps: number;
    transitionState: QuickPickItem | string;
    comment: string;
  }

  const title = isDependencyRisk ? 'Change Dependency Risk Status' : 'Resolve Issue';

  async function resolveIssue(input: MultiStepInput, state: Partial<State>) {
    const response = isDependencyRisk ? await IssueService.instance.checkDependencyRiskStatusChangePermitted(issueKey) :
     await IssueService.instance.checkIssueStatusChangePermitted(workspaceFolderUri, issueKey);
    if (!response.permitted) {
      logToSonarLintOutput(`Status change is not permitted: ${response.notPermittedReason}`);
      return;
    }
    const allowedStatuses: IndexQP[] = response.allowedStatuses.map((label, index) => ({ label: isDependencyRisk ? DependencyRiskTransition[label] : label, index }));
    const pickedIssueStatus = await pickIssueStatus(input, title, allowedStatuses);
    if (pickedIssueStatus) {
      const comment = await inputComment(input, state, isDependencyRisk);
      const changeStatusType = isDependencyRisk ? 'dependency risk' : 'issue';
      showChangeStatusConfirmationDialog(changeStatusType).then(async answer => {
        if (answer === 'Yes') {
          if (isDependencyRisk) {
            await IssueService.instance.changeDependencyRiskStatus(workspaceFolderUri, issueKey, response.allowedStatuses[pickedIssueStatus.index], comment);
          } else {
            await IssueService.instance.changeIssueStatus(workspaceFolderUri, issueKey, pickedIssueStatus.label, fileUri, comment, isTaintIssue);
          }
        }
      });
    }
  }

  async function inputComment(input: MultiStepInput, state: Partial<State>, isDependencyRisk: boolean) {
    const prompt = isDependencyRisk ? 'Provide a reason for changing the dependency risk status (required for \'Accept\' and \'Safe\' transitions)' :
     'Consider providing a reason for muting the issue (leave empty for not adding a new comment)';
    state.comment = await input.showInputBox({
      title,
      step: 2,
      totalSteps: 2,
      value: typeof state.transitionState === 'string' ? state.transitionState : '',
      prompt
    });
    return state.comment;
  }

  async function pickIssueStatus(input: MultiStepInput,
                                 title: string,
                                 resolveTransitions: IndexQP[]): Promise<IndexQP> {
    const placeholder = isDependencyRisk ? 'Choose a transition for the dependency risk' : 'Choose a resolution status for the issue';
    return await input.showQuickPick({
      title,
      step: 1,
      totalSteps: 2,
      placeholder,
      items: resolveTransitions
    });
  }

  const state = {} as Partial<State>;
  await MultiStepInput.run(input => resolveIssue(input, state));
}
