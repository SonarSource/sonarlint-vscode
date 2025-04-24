import * as React from "react";
import { Button } from "@sonarsource/echoes-react";

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

export default ({ vscode }) => {
  const [serverConnections, setServerConnections] = React.useState<ServerConnection[]>([]);
  const [cloudConnections, setCloudConnections] = React.useState<CloudConnection[]>([]);
  React.useEffect(() => {
    window.addEventListener('message', (event) => {
      console.log(JSON.stringify(event));
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
