import * as React from "react";

interface Connection {
  serverUrl: string;
  connectionId?: string;
}

export default () => {
  const [connections, setConnections] = React.useState<Connection[]>([]);
  React.useEffect(() => {
    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.command === 'setConnections') {
        setConnections(message.connections);
      }
    });
    return () => { /* NOP */ };
  });

  return (<>
    <h1>Welcome to the List of SonarQube Connections View!</h1>
    <ul title="Server Connections">
      {connections.map((connection) => (
        <li key={connection.serverUrl}>
          <span>{connection.serverUrl}</span>
          <br />
          <span>{connection.connectionId}</span>
        </li>
      ))}
    </ul>
  </>);
};
