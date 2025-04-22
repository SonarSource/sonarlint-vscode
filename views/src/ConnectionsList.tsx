import * as React from "react";

interface ConnectionCheckResult {
  connectionId: string;
  success: boolean;
  reason?: string;
}

interface ServerConnection {
  serverUrl: string;
  connectionId?: string;
}

interface CloudConnection {
  organizationKey: string;
  connectionId?: string;
}

export default ({ vscode }) => {
  const [serverConnections, setServerConnections] = React.useState<ServerConnection[]>([]);
  const [cloudConnections, setCloudConnections] = React.useState<CloudConnection[]>([]);
  React.useEffect(() => {
    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.command === 'setServerConnections') {
        setServerConnections(message.connections);
      } else if (message.command === 'setCloudConnections') {
        setCloudConnections(message.connections);
      }
    });
    return () => { /* NOP */ };
  });

  return (<>
    <h1>Welcome to the List of SonarQube Connections View!</h1>
    <h2>Server Connections</h2>
    <ul title="Server Connections">
      {serverConnections.map((connection) => (
        <li title={connection.serverUrl}>
          <span>{connection.serverUrl}</span>
          <br />
          <span>{connection.connectionId}</span>
        </li>
      ))}
    </ul>
    <h2>Cloud Connections</h2>
    <ul title = "Cloud Connections">
      {cloudConnections.map((connection) => (
        <li key={connection.organizationKey}>
          <span>{connection.organizationKey}</span>
          <br />
          <span>{connection.connectionId}</span>
        </li>
      ))}
    </ul>
    <button onClick={() => { vscode.postMessage({ command: 'showNotification', displayMessage: 'This came from WebView' }) }}>
      Show Demo Notification
    </button>
  </>);
};
