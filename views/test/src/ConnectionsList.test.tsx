/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { describe, expect, jest, test } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { WebviewApi } from 'vscode-webview';
import { EchoesProvider } from '@sonarsource/echoes-react';

import ConnectionsList from '../../src/ConnectionsList';

const mockVscode = {
  postMessage: jest.fn(),
  getState: jest.fn(),
  setState: jest.fn(),
} as WebviewApi<any>;

describe('ConnectionsList', () => {
  test('renders correctly', () => {
    render(
      <EchoesProvider>
        <ConnectionsList vscode={mockVscode} />
      </EchoesProvider>);
    const title = screen.findByText('Welcome to the List of SonarQube Connections View!');
    expect(title).toBeDefined();
  });
});
