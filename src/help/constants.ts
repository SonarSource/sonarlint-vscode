import { SonarLintDocumentation } from '../commons';
import { Command } from 'vscode';
import { Commands } from '../util/commands';

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
    id: 'checkLogs',
    label: 'See Extension Logs',
    icon: 'output',
    viewItem: true,
    command: {
      command: Commands.ENABLE_LOGS_AND_SHOW_OUTPUT,
      title: 'Show SonarQube Output'
    }
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
