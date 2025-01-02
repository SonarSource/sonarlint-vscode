/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';

const CAN_SHOW_PROMO_NOTIFICATIONS_KEY = 'SonarLint.CanShowPromoNotifications';
const LAST_SHOWED_PROMO_NOTIFICATION_MILLI = 'SonarLint.LastShowedPromoNotificationAt';
const MILLISECONDS_IN_A_DAY = 86400000;
const PROMOTIONAL_PERIOD_DAYS = 7;

export async function maybeShowWiderLanguageSupportNotification(context: vscode.ExtensionContext, languages: string[]) {
  const areNotificationsEnabled = context.globalState.get(CAN_SHOW_PROMO_NOTIFICATIONS_KEY, true);
  const lastShowedNotificationAt = context.globalState.get(LAST_SHOWED_PROMO_NOTIFICATION_MILLI, 0);

  const notShownNotificationInCurrentPromoPeriod = lastShowedNotificationAt === 0 ||
    ((Date.now() - lastShowedNotificationAt) / MILLISECONDS_IN_A_DAY) >= PROMOTIONAL_PERIOD_DAYS;

  if (areNotificationsEnabled && notShownNotificationInCurrentPromoPeriod) {
    const learnMoreAction = 'Learn More';
    const dontShowAgainAction = 'Don\'t Show Again';
    const message = languages.length > 1 ? `Enable ${languages[0]} or ${languages[1]} analysis by setting up SonarLint Connected Mode.` :
      `Enable ${languages[0]} analysis by setting up SonarLint Connected Mode.`;
    const selection = await vscode.window.showInformationMessage(message, learnMoreAction, dontShowAgainAction);

    if (selection === dontShowAgainAction) {
      context.globalState.update(CAN_SHOW_PROMO_NOTIFICATIONS_KEY, false);
    } else if (selection === learnMoreAction) {
      vscode.commands.executeCommand('SonarLint.ConnectedMode.focus');
    }

    context.globalState.update(LAST_SHOWED_PROMO_NOTIFICATION_MILLI, Date.now());
  }
}