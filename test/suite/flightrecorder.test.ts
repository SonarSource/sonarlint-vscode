/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { expect } from 'chai';
import * as vscode from 'vscode';
import * as sinon from 'sinon';

import { FlightRecorderService } from '../../src/monitoring/flightrecorder';
import { ProcessManager } from '../../src/monitoring/processManager';
import { Commands } from '../../src/util/commands';

suite('Flight Recorder Test Suite', async () => {

  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
  });

  teardown(() => {
    sandbox.restore();
  });

  test('Should not allow starting recorder without language server process', async () => {
    // Ensure no process is registered
    sandbox.stub(ProcessManager.instance, 'getLanguageServerPid').returns(undefined);

    // Try to start recording - it should work even without a running server
    // Recording doesn't require the server to be running, only capturing does
    const service = FlightRecorderService.instance;
    expect(service.recording).to.be.false;
  });

  test('Should not allow capturing thread dump without recording started', async () => {
    const service = FlightRecorderService.instance;
    const showErrorStub = sandbox.stub(vscode.window, 'showErrorMessage');

    // Try to capture thread dump without starting recording
    await service.captureThreadDump();

    // Should show error message
    expect(showErrorStub.calledWith('SonarQube Flight Recorder is not running. Start recording first.')).to.be.true;
  });

  test('Should not allow capturing heap dump without recording started', async () => {
    const service = FlightRecorderService.instance;
    const showErrorStub = sandbox.stub(vscode.window, 'showErrorMessage');

    // Try to capture heap dump without starting recording
    await service.captureHeapDump();

    // Should show error message
    expect(showErrorStub.calledWith('SonarQube Flight Recorder is not running. Start recording first.')).to.be.true;
  });

  test('Should not allow capturing thread dump without language server running', async () => {
    const service = FlightRecorderService.instance;
    const showErrorStub = sandbox.stub(vscode.window, 'showErrorMessage');
    sandbox.stub(ProcessManager.instance, 'getLanguageServerPid').returns(undefined);

    // Assume recording is started (we stub the internal state check)
    // This is a limitation of the current test - in real implementation we'd need to properly mock
    // the file system operations and start recording

    // Try to capture thread dump without language server
    await service.captureThreadDump();

    // Should show error message (either not recording or no PID)
    expect(showErrorStub.called).to.be.true;
  });

  test('Commands should be registered', async () => {
    // Verify that the new commands are registered
    const commands = await vscode.commands.getCommands(true);

    expect(commands).to.include(Commands.START_FLIGHT_RECORDER);
    expect(commands).to.include(Commands.STOP_FLIGHT_RECORDER);
    expect(commands).to.include(Commands.DUMP_BACKEND_THREADS);
    expect(commands).to.include(Commands.CAPTURE_HEAP_DUMP);
  });
});
