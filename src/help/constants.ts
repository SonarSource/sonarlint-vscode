import { SonarLintDocumentation } from '../commons';
import { Command } from 'vscode';
import { Commands } from '../util/commands';
import { Utm } from '../util/utm';

export interface HelpAndFeedbackItem {
  id: string;
  label?: string;
  url?: string;
  icon?: string;
  viewItem: boolean;
  command?: Command;
  utm?: Utm;
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
    url: 'https://docs.sonarsource.com/sonarqube-for-vs-code/connect-your-ide/connected-mode/',
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
  },
  {
    id: 'sonarLintWalkthrough',
    viewItem: false,
    command: {
      command: 'workbench.action.openWalkthrough',
      title: 'Welcome to SonarQube for IDE!',
      arguments: ['SonarSource.sonarlint-vscode#SonarLint.walkthrough', false]
    }
  },
  {
    id: 'aiAgentsConfigurationDoc',
    url: 'https://docs.sonarsource.com/sonarqube-for-vs-code/ai-capabilities/agents#sonarqube-mcp-server',
    viewItem: false
  },
  {
    id: 'earlyAccessTerms',
    url: 'https://www.sonarsource.com/legal/early-access/',
    viewItem: false
  },
  {
    id: 'privacyNotice',
    url: 'https://www.sonarsource.com/company/privacy/',
    viewItem: false
  },
  {
    id: 'vcsChangedFilesAnalysisLink',
    url: 'https://docs.sonarsource.com/sonarqube-for-vs-code/getting-started/running-an-analysis/#analyze-changed-files/',
    viewItem: false
  },
  {
    id: 'mcpIntegrationLink',
    url: 'https://docs.sonarsource.com/sonarqube-for-vs-code/ai-capabilities/agents#sonarqube-mcp-server/',
    viewItem: false
  },
  {
    id: 'dependencyRiskManagementLink',
    url: 'https://docs.sonarsource.com/sonarqube-for-vs-code/using/dependency-risks/',
    viewItem: false
  }
];
