/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as React from 'react';
import styled from '@emotion/styled';
import { Button, Card, CardSize, Heading, IconCheckCircle, IconError, IconQuestionMark, IconRocket, Text } from '@sonarsource/echoes-react';
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

const Status = ({ result }: { result?: ConnectionCheckResult}) => {
  if (! result) {
    return <IconQuestionMark />
  } else if (result.success) {
    return <IconCheckCircle />
  } else {
    return <IconError />
  }
}

const CardWithSpacing = styled(Card)`
  margin: 0.5em 0;
`;

const SonarQubeCard = (connection: ServerConnection & { key: string }) => (
  <CardWithSpacing size={CardSize.SMALL} hasDivider data-key={connection.connectionId}>
    <Card.Header title={connection.connectionId} rightContent={<Status result={connection.connectionCheckResult} />} />
    <Card.Body>
      <a href={connection.serverUrl}>Open Dashboard</a>
    </Card.Body>
  </CardWithSpacing>
);

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
  }, [ /* run useEffect only at first render */ ]);

  return (<>
    <Heading as="h1">Welcome to the List of SonarQube Connections View!</Heading>
    <Heading as="h2">Server Connections</Heading>
    {serverConnections.map((connection: ServerConnection) =>
      <SonarQubeCard key={connection.connectionId}
                     serverUrl={connection.serverUrl}
                     connectionId={connection.connectionId}
                     connectionCheckResult={connection.connectionCheckResult} />
    )}
    <Heading as="h2">Cloud Connections</Heading>
    {cloudConnections.map((connection) => (
      <CardWithSpacing size={CardSize.SMALL} hasDivider key={connection.connectionId} data-key={connection.connectionId}>
        <Card.Header title={connection.connectionId} />
        <Card.Body>
          <Text as="span">{connection.organizationKey}</Text>
        </Card.Body>
      </CardWithSpacing>
    ))}
    <Button prefix={<IconRocket/>}
            variety="primary"
            onClick={() => { vscode.postMessage({ command: 'showNotification', displayMessage: 'This came from WebView' }) }}>
      Show Demo Notification
    </Button>
  </>);
};
