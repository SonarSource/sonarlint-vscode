/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { describe, expect, jest, test } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { WebviewApi } from 'vscode-webview';
import { EchoesProvider } from '@sonarsource/echoes-react';

import ConnectionsList from '../../src/ConnectionsList';

const mockVscode = {
  postMessage: jest.fn(),
  getState: jest.fn(),
  setState: jest.fn(),
} as WebviewApi<any>;

const testOrigin = 'vscode-webview://test';

describe('ConnectionsList', () => {

  beforeEach(() => {
    delete window.origin;
    window.origin = testOrigin;
  });

  test('renders correctly', () => {
    render(
      <EchoesProvider>
        <ConnectionsList vscode={mockVscode} />
      </EchoesProvider>);
    const title = screen.findByText('Welcome to the List of SonarQube Connections View!');
    expect(title).toBeDefined();

    expect(mockVscode.postMessage).toHaveBeenCalledWith({ command: 'ready' });
  });

  test('renders correctly with Server connections', async () => {
    render(
      <EchoesProvider>
        <ConnectionsList vscode={mockVscode} />
      </EchoesProvider>);

    fireEvent(window, new MessageEvent('message', {
      origin: testOrigin,
      data: {
        command: 'setServerConnections',
        connections: [
          { serverUrl: 'https://my-sq-server1.example', connectionId: 'My SQ Server 1' },
          { serverUrl: 'https://my-sq-server2.example', connectionId: 'My SQ Server 2' },
        ]
      }
    }));

    const serverUrlSpans = await screen.findAllByText(/my-sq-server/);
    expect(serverUrlSpans).toHaveLength(2);
  });

  test('renders and sends back message', async () => {
    render(
      <EchoesProvider>
        <ConnectionsList vscode={mockVscode} />
      </EchoesProvider>);

    const button = screen.getByText('Show Demo Notification').closest('button');
    fireEvent(button, new MouseEvent('click'));

    waitFor(() => expect(mockVscode.postMessage).toHaveBeenCalledWith(
      { command: 'ready' },
      { command: 'showNotification', displayMessage: 'This came from WebView' },
    ));
  });
});
