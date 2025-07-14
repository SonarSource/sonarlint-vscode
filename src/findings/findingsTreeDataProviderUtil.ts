/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import { ImpactSeverity } from '../lsp/protocol';
import { resolveExtensionFile } from '../util/util';
import { IndexQP } from '../cfamily/cfamily';

export const NOTEBOOK_CELL_URI_SCHEME = 'vscode-notebook-cell';

export enum HotspotReviewPriority {
  High = 1,
  Medium = 2,
  Low = 3
}

export enum FindingType {
  SecurityHotspot = 'hotspot',
  TaintVulnerability = 'taint',
  Issue = 'issue'
}

export enum FilterType {
  All = 'all',
  Fix_Available = 'fix_available',
  Open_Files_Only = 'open_files_only',
  High_Severity_Only = 'high_severity_only',
  Current_File_Only = 'current_file_only'
}

export enum FindingSource {
  SonarQube = 'sonarqube', // on-the-fly analysis
  Latest_SonarQube = 'Latest SonarQube Server Analysis', // taint
  Latest_SonarCloud = 'Latest SonarQube Cloud Analysis', // taint
  Remote_Hotspot = 'remote-hotspot', // hotspot that matched remote one; Still on-the-fly analysis
  Local_Hotspot = 'local-hotspot' // locally detected hotspot that has not matched with server one
}

export interface Finding {
  key: string;
  serverIssueKey?: string;
  contextValue: FindingContextValue;
  type: FindingType;
  source: FindingSource;
  severity?: number;
  vulnerabilityProbability?: HotspotReviewPriority;
  message: string;
  ruleKey: string;
  fileUri: string;
  status: number;
}

export const SOURCE_CONFIG: Record<
  FindingSource,
  {
    icon?: string;
    iconColor?: string;
    label?: string;
    tooltipText?: string;
  }
> = {
  [FindingSource.SonarQube]: {},
  [FindingSource.Local_Hotspot]: {
    icon: 'security-hotspot',
    iconColor: 'descriptionForeground',
    label: 'Security Hotspot',
    tooltipText: 'This Security Hotspot only exists locally'
  },
  [FindingSource.Remote_Hotspot]: {
    icon: 'security-hotspot',
    iconColor: 'descriptionForeground',
    label: 'Security Hotspot',
    tooltipText: 'This Security Hotspot exists on remote project'
  },
  [FindingSource.Latest_SonarQube]: {
    label: 'Taint Vulnerability',
    tooltipText: 'This Taint Vulnerability was detected by SonarQube Server'
  },
  [FindingSource.Latest_SonarCloud]: {
    label: 'Taint Vulnerability',
    tooltipText: 'This Taint Vulnerability was detected by SonarQube Cloud'
  }
};

export const impactSeverityToIcon = (impactSeverity: ImpactSeverity): vscode.IconPath => {
  switch (impactSeverity) {
    case ImpactSeverity.INFO:
      return {
        light: resolveExtensionFile('images', 'impact', `info.svg`),
        dark: resolveExtensionFile('images', 'impact', `info_dark.svg`)
      };
    case ImpactSeverity.LOW:
      return {
        light: resolveExtensionFile('images', 'impact', `low.svg`),
        dark: resolveExtensionFile('images', 'impact', `low_dark.svg`)
      };
    case ImpactSeverity.HIGH:
      return {
        light: resolveExtensionFile('images', 'impact', `high.svg`),
        dark: resolveExtensionFile('images', 'impact', `high_dark.svg`)
      };
    case ImpactSeverity.BLOCKER:
      return {
        light: resolveExtensionFile('images', 'impact', `blocker.svg`),
        dark: resolveExtensionFile('images', 'impact', `blocker_dark.svg`)
      };
    case ImpactSeverity.MEDIUM:
    default:
      return {
        light: resolveExtensionFile('images', 'impact', `medium.svg`),
        dark: resolveExtensionFile('images', 'impact', `medium_dark.svg`)
      };
  }
};

export type FindingContextValue =
  | 'newHotspotItem'
  | 'knownHotspotItem'
  | 'taintVulnerabilityItem'
  | 'AICodeFixableTaintItem'
  | 'AICodeFixableIssueItem'
  | 'issueItem'
  | 'notebookIssueItem';

export function getContextValueForFinding(source: FindingSource, isAiCodeFixable: boolean, isNotebookFinding: boolean): FindingContextValue {
  switch (source) {
    case FindingSource.Remote_Hotspot:
      return 'knownHotspotItem';
    case FindingSource.Local_Hotspot:
      return 'newHotspotItem';
    case FindingSource.Latest_SonarCloud:
    case FindingSource.Latest_SonarQube:
      return isAiCodeFixable ? 'AICodeFixableTaintItem' : 'taintVulnerabilityItem';
    case FindingSource.SonarQube:
      if (isNotebookFinding) {
        return 'notebookIssueItem';
      } else if (isAiCodeFixable) {
        return 'AICodeFixableIssueItem';
      } else {
        return 'issueItem';
      }
    default:
      return 'issueItem';
  }
}

export function isFileOpen(fileUri: string): boolean {
  return vscode.workspace.textDocuments.some(doc => doc.uri.toString() === fileUri);
}

export function isCurrentFile(fileUri: string): boolean {
  const activeEditor = vscode.window.activeTextEditor;
  return activeEditor && activeEditor.document.uri.toString() === fileUri;
}

export function getFilterContextValue(filter: FilterType): string {
  switch (filter) {
    case FilterType.All:
      return 'filter-all';
    case FilterType.Fix_Available:
      return 'filter-fix-available';
    case FilterType.Open_Files_Only:
      return 'filter-open-files';
    case FilterType.High_Severity_Only:
      return 'filter-high-severity';
    case FilterType.Current_File_Only:
      return 'filter-current-file';
    default:
      return 'filter-all';
  }
}

export function getFilterDisplayName(filter: FilterType): string {
  switch (filter) {
    case FilterType.All:
      return 'All Findings';
    case FilterType.Fix_Available:
      return 'Findings with Fix Available';
    case FilterType.Open_Files_Only:
      return 'Findings in Open Files';
    case FilterType.High_Severity_Only:
      return 'High Severity Findings';
    case FilterType.Current_File_Only:
      return 'Findings in Current File';
    default:
      return 'All Findings';
  }
}

export async function selectAndApplyCodeAction(codeActions: vscode.CodeAction[]) {
  const selection : IndexQP | undefined = await vscode.window.showQuickPick(codeActions.map((qf, index) => ({
    label: qf.title,
    detail: ``,
    index
  })), {
    title: 'Select an Action to Apply',
    placeHolder: 'What would you like to do?',
  });

  if (selection) {
    const selectedAction = codeActions[selection.index];
    
    // If the code action has edits, it's a QuickFix. apply them
    if (selectedAction.edit) {
      try {
        await vscode.workspace.applyEdit(selectedAction.edit);
        await vscode.commands.executeCommand(selectedAction.command.command, ...(selectedAction.command.arguments || []));
      } catch (error) {
        vscode.window.showErrorMessage(`Error applying quick fix: ${error.message}`);
      }
    }
    else if (selectedAction.command) {
      await vscode.commands.executeCommand(selectedAction.command.command, ...(selectedAction.command.arguments || []));
    }
    else {
      vscode.window.showWarningMessage('Selected Code Action has no edit or command to execute.');
    }
  }
}

export function isNotebookCellUri(uri: string): boolean {
  return uri.startsWith(NOTEBOOK_CELL_URI_SCHEME);
}
