import { SonarLintDocumentation } from '../commons';
import { Command } from 'vscode';

export interface HelpAndFeedbackItem {
  id: string;
  label: string;
  url?: string;
  icon: string;
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
    id: 'supportedRules',
    label: 'See Languages & Rules',
    url: SonarLintDocumentation.LANGUAGES_AND_RULES,
    icon: 'checklist',
    viewItem: true
  },
  {
    id: 'whatsNew',
    label: "Check What's New",
    url: 'https://www.sonarsource.com/products/sonarlint/whats-new/vs-code/',
    icon: 'megaphone',
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
    id: 'faq',
    label: 'Review FAQ',
    url: 'https://community.sonarsource.com/t/frequently-asked-questions/7204',
    icon: 'question',
    viewItem: true
  },
  {
    id: 'sonarCloudProductPage',
    label: 'SonarQube Cloud',
    url: 'https://www.sonarsource.com/products/sonarcloud/',
    icon: 'n/a',
    viewItem: false
  },
  {
    id: 'sonarQubeProductPage',
    label: 'SonarQube Server',
    url: 'https://www.sonarsource.com/products/sonarqube/',
    icon: 'n/a',
    viewItem: false
  },
  {
    id: 'connectedModeDocs',
    label: 'Connected Mode',
    url: 'https://docs.sonarsource.com/sonarqube-for-ide/vs-code/team-features/connected-mode/',
    icon: 'n/a',
    viewItem: false
  },
  {
    id: 'compareServerProducts',
    label: 'Compare SonarQube Server and SonarQube Cloud',
    url: 'https://www.sonarsource.com/blog/sq-sc_guidance/',
    icon: 'n/a',
    viewItem: false
  },
  {
    id: 'sonarQubeEditionsDownloads',
    label: 'SonarQube Server Downloads',
    url: 'https://www.sonarsource.com/products/sonarqube/downloads/',
    icon: 'n/a',
    viewItem: false
  }
];
