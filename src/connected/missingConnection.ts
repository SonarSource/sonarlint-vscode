/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { ExtendedServer } from '../lsp/protocol';
import { SonarCloudRegion } from '../settings/connectionsettings';

export type MissingConnection =
  | { kind: 'sonarqube'; serverUrl: string; connectionId: string }
  | { kind: 'sonarcloud'; organization: string; region: SonarCloudRegion; connectionId: string }
  | { kind: 'unknown'; connectionId: string };

export function missingConnectionOf(binding: ExtendedServer.BindingInfo): MissingConnection {
  const connectionId = binding.connectionId ?? '';
  if (binding.serverUrl) {
    return { kind: 'sonarqube', serverUrl: binding.serverUrl, connectionId };
  }
  if (binding.organization) {
    return { kind: 'sonarcloud', organization: binding.organization, region: (binding.region as SonarCloudRegion) ?? 'EU', connectionId };
  }
  return { kind: 'unknown', connectionId };
}

export function describeMissingConnection(binding: ExtendedServer.BindingInfo): string {
  const missing = missingConnectionOf(binding);
  switch (missing.kind) {
    case 'sonarqube':
      return `SonarQube Server ${missing.serverUrl}`;
    case 'sonarcloud':
      return `SonarQube Cloud organization '${missing.organization}' (${missing.region})`;
    default:
      return missing.connectionId ? `connection '${missing.connectionId}'` : 'a connection';
  }
}

type FromUnresolvedBinding = { binding?: ExtendedServer.BindingInfo } | undefined;

export function sonarQubeFormValuesOf(item: FromUnresolvedBinding) {
  const missing = item?.binding ? missingConnectionOf(item.binding) : undefined;
  return {
    serverUrl: missing?.kind === 'sonarqube' ? missing.serverUrl : '',
    connectionId: missing?.connectionId ?? ''
  };
}

export function sonarCloudFormValuesOf(item: FromUnresolvedBinding) {
  const missing = item?.binding ? missingConnectionOf(item.binding) : undefined;
  return {
    organization: missing?.kind === 'sonarcloud' ? missing.organization : '',
    region: missing?.kind === 'sonarcloud' ? missing.region : ('EU' as SonarCloudRegion),
    connectionId: missing?.connectionId ?? ''
  };
}
