/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';

import { getHelpAndFeedbackItemById } from './helpAndFeedbackTreeDataProvider';
import { HAS_CLICKED_GET_STARTED_LINK } from '../commons';
import { ContextManager } from '../contextManager';
import { SonarLintExtendedLanguageClient } from '../lsp/client';
import { addUtmIfNeeded, Utm } from '../util/utm';
import { Commands } from '../util/commands';
import { extensionContext } from '../util/util';

type HelpAndFeedbackItemOrId = undefined | string | { id: string, utm?: Utm };

export function helpAndFeedbackLinkClicked(languageClient: SonarLintExtendedLanguageClient) {
  return (helpAndFeedbackItemOrId: HelpAndFeedbackItemOrId) => {
    let itemId: string;
    let utm: Utm;
    if (!helpAndFeedbackItemOrId) {
      itemId = 'getHelp';
    } else if (typeof helpAndFeedbackItemOrId === 'string') {
      itemId = helpAndFeedbackItemOrId;
    } else {
      itemId = helpAndFeedbackItemOrId.id;
      utm = helpAndFeedbackItemOrId.utm;
    }
    const { command, url } = getHelpAndFeedbackItemById(itemId);
    languageClient.helpAndFeedbackLinkClicked(itemId);
    if (command) {
      const args = command.arguments || [];
      vscode.commands.executeCommand(command.command, ...args);
      // if the link clicked was the get started one, we update the global flag to not show it again
      if (itemId === 'sonarLintWalkthrough') {
        extensionContext.globalState.update(HAS_CLICKED_GET_STARTED_LINK, true);
        ContextManager.instance.setGetStartedViewContext(extensionContext);
      }
    } else {
      const fullUrl = addUtmIfNeeded(url, utm);
      vscode.commands.executeCommand(Commands.OPEN_BROWSER, vscode.Uri.parse(fullUrl));
    }
  };
}
