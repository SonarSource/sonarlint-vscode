/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as React from 'react';
import { Button } from '@sonarsource/echoes-react';
import { WebviewApi } from 'vscode-webview';

interface ConnectionCheckResult {
  connectionId: string;
  success: boolean;
  reason?: string;
}

interface ServerConnection {
  serverUrl: string;
  connectionId?: string;
  connectionCheckResult?: ConnectionCheckResult;
}

interface CloudConnection {
  organizationKey: string;
  connectionId?: string;
  connectionCheckResult?: ConnectionCheckResult;
}

interface Props {
  vscode: WebviewApi<any>
}

export default ({ vscode }: Props) => {
  const [serverConnections, setServerConnections] = React.useState<ServerConnection[]>([]);
  const [cloudConnections, setCloudConnections] = React.useState<CloudConnection[]>([]);
  React.useEffect(() => {
    window.addEventListener('message', (event) => {
      if (event.origin !== window.origin) {
        return;
      }
      const message = event.data;
      if (message.command === 'setServerConnections') {
        setServerConnections(message.connections);
      } else if (message.command === 'setCloudConnections') {
        setCloudConnections(message.connections);
      }
    });
    vscode.postMessage({ command: 'ready' });
    return () => { /* NOP */ };
  });

  return (<>
    <h1>Welcome to the List of SonarQube Connections View!</h1>
    <h2>Server Connections</h2>
    <ul title="Server Connections">
      {serverConnections.map((connection) => (
        <li title={connection.serverUrl} key={connection.connectionId}>
          <span>{connection.serverUrl}</span>
          <br />
          <span>{connection.connectionId}</span>
        </li>
      ))}
    </ul>
    <h2>Cloud Connections</h2>
    <ul title = "Cloud Connections">
      {cloudConnections.map((connection) => (
        <li title={connection.organizationKey} key={connection.connectionId}>
          <span>{connection.organizationKey}</span>
          <br />
          <span>{connection.connectionId}</span>
        </li>
      ))}
    </ul>
    <Button onClick={() => { vscode.postMessage({ command: 'showNotification', displayMessage: 'This came from WebView' }) }}>
      Show Demo Notification
    </Button>
  </>);
};
