/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2024 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as process from 'process';
import {
  defaultStackParser,
  getDefaultIntegrations,
  NodeClient,
  makeNodeTransport,
  Scope, EventHint
} from '@sentry/node';
import * as vscode from 'vscode';

import { isDogfoodingEnvironment } from './dogfooding';
import * as util from '../util/util';

const SKIPPED_DEFAULT_INTEGRATIONS = [
  'Breadcrumbs',
  'GlobalHandlers'
];

export class MonitoringService implements vscode.TelemetrySender {

  public static readonly instance = new MonitoringService();
  private readonly scope: Scope;

  private constructor() {
    if(isDogfoodingEnvironment()) {
      console.info('Initializing monitoring service in dogfooding environment');

      // Following the recommendations on shared environment, we're initializing our Sentry client manually
      // to avoid catching events from other extensions or from the VSCode platform itself
      // See: https://docs.sentry.io/platforms/javascript/best-practices/shared-environments/

      // Filter integrations that use the global variable
      const integrations = getDefaultIntegrations({}).filter(
        (defaultIntegration) => {
          return !SKIPPED_DEFAULT_INTEGRATIONS.includes(defaultIntegration.name);
        },
      );

      const client = new NodeClient({
        dsn: 'https://5e3853ab83d91a04bfc8d81347dadc14@o1316750.ingest.us.sentry.io/4508460058214400',
        transport: makeNodeTransport,
        stackParser: defaultStackParser,
        integrations,
        environment: 'dogfood',
        release: util.packageJson.version,
        beforeSend: (event, hint) => {
          event.tags = {
            productKey: 'vscode',
            ideVersion: vscode.version,
            architecture: process.arch,
            ...event.tags
          }
          return event;
        }
      });

      this.scope = new Scope();
      this.scope.setClient(client);

      client.init();
    }
  }

  public captureException(exception: Error, hint?: EventHint) {
    this.scope?.captureException(exception, hint);
  }

  sendErrorData(error: Error, data?: Record<string, any>) {
    this.captureException(error, { data });
  }

  sendEventData(eventName: string, data?: Record<string, any>) {
    // This method is required by the TelemetrySender contract, but we don't actually use it yet
    console.warn(`Unexpected telemetry event '${eventName}' with data: ${JSON.stringify(data)}`);
  }

  async flush() {
    // This is supposed to be called when the extension is disposed, to give a chance to send pending events
    await this.scope?.getClient().flush();
  }
}
