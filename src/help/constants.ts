import { SonarLintDocumentation } from '../commons';
import { Command } from 'vscode';

export interface HelpAndFeedbackItem {
  id: string;
  label?: string;
  url?: string;
  icon?: string;
  viewItem: boolean;
  command?: Command;
}

export const helpAndFeedbackItems: HelpAndFeedbackItem[] = [
  {
    id: 'sonarLintWalkthrough',
    label: 'Get Started',
    icon: 'heart',
    viewItem: true,
    command: {
      command: 'workbench.action.openWalkthrough',
      title: 'Welcome to SonarQube for VS Code!',
      arguments: ['SonarSource.sonarlint-vscode#SonarLint.walkthrough', false]
    }
  },
  {
    id: 'docs',
    label: 'Read Documentation',
    url: SonarLintDocumentation.BASE_DOCS_URL,
    icon: 'book',
    viewItem: true
  },
  {
    id: 'getHelp',
    label: 'Get Help | Report Issue',
    url: 'https://community.sonarsource.com/c/sl/vs-code/36',
    icon: 'comment-discussion',
    viewItem: true
  },
  {
    id: 'suggestFeature',
    label: 'Suggest a Feature',
    url: 'https://www.sonarsource.com/products/sonarlint/roadmap/',
    icon: 'extensions',
    viewItem: true
  },
  {
    id: 'sonarCloudProductPage',
    url: 'https://www.sonarsource.com/products/sonarcloud/',
    viewItem: false
  },
  {
    id: 'sonarqubeCloudFreeSignUp',
    url: 'https://www.sonarsource.com/products/sonarcloud/signup-free/',
    viewItem: false
  },
  {
    id: 'sonarQubeProductPage',
    url: 'https://www.sonarsource.com/products/sonarqube/',
    viewItem: false
  },
  {
    id: 'connectedModeDocs',
    url: 'https://docs.sonarsource.com/sonarqube-for-ide/vs-code/team-features/connected-mode/',
    viewItem: false
  },
  {
    id: 'compareServerProducts',
    url: 'https://www.sonarsource.com/plans-and-pricing/sonarcloud/',
    viewItem: false
  },
  {
    id: 'sonarQubeEditionsDownloads',
    url: 'https://www.sonarsource.com/products/sonarqube/downloads/',
    viewItem: false
  }
];
