/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

'use strict';

export enum FeatureTag {
  STABLE = 'stable',
  EXPERIMENTAL = 'experimental',
  NEW = 'new',
  CONNECTED_MODE = 'connected-mode'
}

export interface LabsFeature {
  id: string;
  title: string;
  description: string;
  imageFile: string;
  tags: FeatureTag[];
  learnMoreUrl: string;
  feedbackUrl: string;
}

export const LABS_FEATURES: LabsFeature[] = [
  {
    id: 'changed_files_analysis',
    title: 'Analysis of VCS Changed Files',
    description:
      'Trigger analysis on all files changed since the last commit to ensure fewer issues reach your remote repository. This is especially useful if automatic analysis is disabled for your development project.',
    imageFile: 'labs/analyze_vcs_changed_files.png',
    tags: [FeatureTag.EXPERIMENTAL],
    learnMoreUrl:
      'https://docs.sonarsource.com/sonarqube-for-vs-code/getting-started/running-an-analysis#analyze-changed-files',
    feedbackUrl: 'https://forms.gle/vWXAsdZFYJSnGyjh8'
  },
  {
    id: 'ai_agents_integration',
    title: 'AI Agents Integration',
    description: 'Seamlessly integrate AI agents from your favorite IDE with the SonarQube platform. You can automatically configure the SonarQube MCP Server and define a custom rules file for your active agents.',
    imageFile: 'labs/ai_agents_integration.png',
    tags: [FeatureTag.NEW, FeatureTag.CONNECTED_MODE],
    learnMoreUrl: 'https://docs.sonarsource.com/sonarqube-for-vs-code/ai-capabilities/agents#sonarqube-mcp-server',
    feedbackUrl: 'https://forms.gle/5Fy2a4Kk5nN9GrSX7'
  },
  {
    id: 'dependency_risk_management',
    title: 'Dependency Risk Management',
    description: 'Synchronize Software Composition Analysis (SCA) results from SonarQube (Server, Cloud) analysis with your IDE. You can manage and change the status of identified dependency risks directly in the IDE.',
    imageFile: 'labs/dependency_risk_management.png',
    tags: [FeatureTag.STABLE, FeatureTag.CONNECTED_MODE],
    learnMoreUrl: 'https://docs.sonarsource.com/sonarqube-for-vs-code/using/dependency-risks',
    feedbackUrl: 'https://forms.gle/dk3GVaDB63Put9AE7'
  },
  {
    id: 'connected_mode',
    title: 'Connected Mode',
    description:
      "Link SonarQube for IDE to your SonarQube Server or Cloud projects. This enables broader language analysis, comprehensive issue detection across the whole project, and quality gate status notifications.",
    imageFile: 'labs/connected_mode.png',
    tags: [FeatureTag.STABLE, FeatureTag.CONNECTED_MODE],
    learnMoreUrl: 'https://docs.sonarsource.com/sonarqube-for-vs-code/connect-your-ide/connected-mode',
    feedbackUrl: 'https://forms.gle/GgFWfjgQzR9AgDAMA'
  }
];
