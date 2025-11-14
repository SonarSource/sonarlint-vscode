/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { expect } from 'chai';
import * as vscode from 'vscode';

import { FlightRecorderService } from '../../src/monitoring/flightrecorder';
import { Commands } from '../../src/util/commands';
import { sleep } from '../testutil';

suite('Flight Recorder Test Suite', async () => {

  test('Status bar item should be shown when session ID is notified from language server', async () => {
    const sessionId = 'some-session-id';

    // Emulate session ID notified from language server - should show status bar item (no API to query this)
    await FlightRecorderService.instance.onFlightRecorderStarted(sessionId);

    await sleep(1000);

    // Emulate click on "Copy Session ID" (no API to use the actual button)
    await vscode.commands.executeCommand(Commands.COPY_FLIGHT_RECORDER_SESSION_ID);

    await sleep(1000);

    expect(await vscode.env.clipboard.readText()).to.equal(sessionId);

    await vscode.commands.executeCommand(Commands.DUMP_BACKEND_THREADS);

  }).timeout(10_000);
});
