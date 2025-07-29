import { Diagnostic } from 'vscode-languageclient';
import { FindingNode } from './findingNode';
import { FindingSource, FindingType } from '../findingsTreeDataProviderUtil';
import * as vscode from 'vscode';

export class HotspotNode extends FindingNode {
  public readonly vulnerabilityProbability?: HotspotReviewPriority;
  constructor(fileUri: string, finding: Diagnostic,) {
    super(fileUri, FindingType.SecurityHotspot, finding, 'Security Hotspot');
    this.contextValue = finding.source === FindingSource.Remote_Hotspot ? 'knownHotspotItem' : 'newHotspotItem';
    this.vulnerabilityProbability = finding.severity as HotspotReviewPriority;
    this.iconPath = new vscode.ThemeIcon('security-hotspot', new vscode.ThemeColor('descriptionForeground'));
    this.tooltip =
      finding.source === FindingSource.Local_Hotspot
        ? 'This Security Hotspot only exists locally'
        : 'This Security Hotspot exists on remote project';
  }
}

export enum HotspotReviewPriority {
  High = 1,
  Medium = 2,
  Low = 3
}
