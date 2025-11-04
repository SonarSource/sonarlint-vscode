/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

'use strict';

export type FeatureTag = 'feedback' | 'experimental' | 'connected-mode';

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
    id: 'preCommitAnalysis',
    title: 'Pre-Commit Analysis',
    description:
      'Analyze your code for issues before committing, ensuring higher code quality and fewer bugs in your main branches.',
    imageFile: 'labs/placeholder.jpg',
    tags: ['experimental'],
    learnMoreUrl:
      'https://docs.sonarsource.com/sonarqube-for-vs-code/getting-started/running-an-analysis/#analyze-changed-files/',
    feedbackUrl: 'https://forms.gle/zSyznTQAWfhrGZp49'
  },
  {
    id: 'aiAgentsIntegration',
    title: 'AI Agents Integration',
    description: 'Integrate AI agents into your workflow for smarter code analysis and suggestions.',
    imageFile: 'labs/placeholder.jpg',
    tags: ['feedback', 'connected-mode'],
    learnMoreUrl: 'https://docs.sonarsource.com/sonarqube-for-vs-code/ai-capabilities/agents#sonarqube-mcp-server/',
    feedbackUrl: 'https://forms.gle/zSyznTQAWfhrGZp49'
  },
  {
    id: 'dependencyRiskManagement',
    title: 'Dependency Risk Management',
    description: 'Identify and mitigate risks in your project dependencies with advanced analysis tools.',
    imageFile: 'labs/placeholder.jpg',
    tags: ['feedback', 'connected-mode'],
    learnMoreUrl: 'https://docs.sonarsource.com/sonarqube-for-vs-code/using/dependency-risks/',
    feedbackUrl: 'https://forms.gle/zSyznTQAWfhrGZp49'
  },
  {
    id: 'connectedMode',
    title: 'Connected Mode',
    description:
      "Sync your local IDE with SonarQube Cloud or Server for unified quality tracking across your entire team's workflow.",
    imageFile: 'labs/placeholder.jpg',
    tags: ['feedback', 'connected-mode'],
    learnMoreUrl: 'https://docs.sonarsource.com/sonarqube-for-vs-code/team-features/connected-mode/',
    feedbackUrl: 'https://forms.gle/zSyznTQAWfhrGZp49'
  }
];
