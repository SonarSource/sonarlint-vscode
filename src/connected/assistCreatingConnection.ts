/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2024 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';

import { AutomaticConnectionSetupCancellationError } from './automaticConnectionCancellationError';
import { connectToSonarQube } from './connectionsetup';
import { AssistCreatingConnectionParams } from '../lsp/protocol';
import { ConnectionSettingsService, SonarCloudConnection, SonarQubeConnection } from '../settings/connectionsettings';
import { Commands } from '../util/commands';

export function assistCreatingConnection(context: vscode.ExtensionContext) {
  return async (assistCreatingConnectionParams: AssistCreatingConnectionParams) => {
    let newConnectionId: string | null;
    try {
      newConnectionId = await confirmConnectionDetailsAndSave(context)(
        assistCreatingConnectionParams.isSonarCloud,
        assistCreatingConnectionParams.serverUrlOrOrganisationKey,
        assistCreatingConnectionParams.token
      );
    } catch (error) {
      if (error instanceof AutomaticConnectionSetupCancellationError) {
        return null;
      }
    }
    return { newConnectionId };
  };
}

interface ConnectionConfirmationResponse {
  confirmed: boolean;
  cancelled: boolean;
}

async function confirmConnection(isSonarCloud : boolean, serverUrlOrOrganizationKey: string, token: string) : Promise<ConnectionConfirmationResponse> {
  const connectionType = isSonarCloud ? 'SonarCloud organization' : 'SonarQube server';
  let manualConnectionMessage = `Connecting SonarLint to ${isSonarCloud ? 'SonarCloud' : 'SonarQube'} will enable issues to be opened directly in your IDE. It will also allow you to apply the same Clean Code standards as your team, analyze more languages, detect more issues, receive notifications about the quality gate status, and more.
      \nEnsure that the requesting ${isSonarCloud ? 'organization' : 'server URL'} '${serverUrlOrOrganizationKey}' matches your ${connectionType}.`;

  if (!isSonarCloud) {
    manualConnectionMessage += ` Letting SonarLint connect to an untrusted SonarQube server is potentially dangerous. If you don't trust this server, we recommend canceling this action and manually setting up Connected Mode.`
  }

  const automaticConnectionMessage = `${manualConnectionMessage}
      \nA token will be automatically generated to allow access to your ${connectionType}.`

  const yesOption = `Connect to this ${connectionType}`;
  const learnMoreOption = 'What is Connected Mode?'
  const result = await vscode.window.showWarningMessage(
    `Do you trust this ${connectionType}?`,
    { modal: true, detail: token ? automaticConnectionMessage : manualConnectionMessage },
    yesOption,
    learnMoreOption
  );
  return {
    confirmed : result === yesOption,
    cancelled : result === undefined
  };
}


export function confirmConnectionDetailsAndSave(context: vscode.ExtensionContext) {
  return async (isSonarCloud: boolean, serverUrlOrOrganizationKey: string, token: string) => {
    const reply = await confirmConnection(isSonarCloud, serverUrlOrOrganizationKey, token);
    if (reply.confirmed) {
      if (isSonarCloud) {
        const sonarCloudToken = token || await ConnectionSettingsService.instance.getServerToken(serverUrlOrOrganizationKey);
        const connection : SonarCloudConnection = {
          token: sonarCloudToken,
          connectionId: serverUrlOrOrganizationKey,
          disableNotifications: false,
          organizationKey: serverUrlOrOrganizationKey
        };

        return await ConnectionSettingsService.instance.addSonarCloudConnection(connection);
      } else if (!isSonarCloud && token) {
        // new flow for SonarQube
        const connection : SonarQubeConnection = {
          token,
          connectionId: serverUrlOrOrganizationKey,
          disableNotifications: false,
          serverUrl: serverUrlOrOrganizationKey
        };
        return await ConnectionSettingsService.instance.addSonarQubeConnection(connection);
      } else {
        // old flow for SonarQube
        connectToSonarQube(context)(serverUrlOrOrganizationKey);
        throw new AutomaticConnectionSetupCancellationError('Automatic Connection setup cancelled; User will manually enter token');
      }
    } else if (!reply.confirmed && !reply.cancelled) {
      vscode.commands.executeCommand(Commands.TRIGGER_HELP_AND_FEEDBACK_LINK, 'connectedModeDocs');
      throw new AutomaticConnectionSetupCancellationError('Automatic Connection setup was cancelled; Opening documentation');
    }
    throw new AutomaticConnectionSetupCancellationError('Automatic Connection setup was cancelled by the user')
  }
}
