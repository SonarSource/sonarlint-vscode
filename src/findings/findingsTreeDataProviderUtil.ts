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
  Fix_Available = 'fix-available',
  Open_Files_Only = 'open-files-only',
  High_Severity_Only = 'high-severity-only'
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
    case ImpactSeverity.MEDIUM:
      return {
        light: resolveExtensionFile('images', 'impact', `medium.svg`),
        dark: resolveExtensionFile('images', 'impact', `medium_dark.svg`)
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
  }
};

export type FindingContextValue =
  | 'newHotspotItem'
  | 'knownHotspotItem'
  | 'taintVulnerabilityItem'
  | 'AICodeFixableTaintItem'
  | 'AICodeFixableIssueItem'
  | 'issueItem';

export function getContextValueForFinding(source: FindingSource, isAiCodeFixable: boolean): FindingContextValue {
  switch (source) {
    case FindingSource.Remote_Hotspot:
      return 'knownHotspotItem';
    case FindingSource.Latest_SonarCloud:
    case FindingSource.Latest_SonarQube:
      return isAiCodeFixable ? 'AICodeFixableTaintItem' : 'taintVulnerabilityItem';
    case FindingSource.SonarQube:
      return isAiCodeFixable ? 'AICodeFixableIssueItem' : 'issueItem';
    default:
      return 'issueItem';
  }
}
