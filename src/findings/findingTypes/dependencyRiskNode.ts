import { Diagnostic } from 'vscode-languageclient';
import { FindingNode } from './findingNode';
import { FindingSource, FindingType } from '../findingsTreeDataProviderUtil';

export class DependencyRiskNode extends FindingNode {
  constructor(fileUri: string, finding: Diagnostic) {
    super(fileUri, FindingType.DependencyRisk, finding, 'Dependency Risk');
    this.contextValue = 'dependencyRiskItem';
    this.description = `Dependency Risk (${DependencyRiskType[finding.code]})`
    const serverName = this.source === FindingSource.Latest_SonarCloud ? 'SonarQube Cloud' : 'SonarQube Server';
    this.tooltip = `This Dependency Risk was detected by ${serverName}`;
  }
}

enum DependencyRiskType {
  VULNERABILITY = 'Vulnerability',
  PROHIBITED_LICENSE = 'Prohibited License',
}

export enum DependencyRiskTransition {
  CONFIRM = 'Confirm',
  REOPEN = 'Reopen',
  SAFE = 'Safe',
  ACCEPT = 'Accept'
}
