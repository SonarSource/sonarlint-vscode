/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2021 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as lsp from 'vscode-languageserver-protocol';

export namespace ShowRuleDescriptionRequest {
  export const type = new lsp.RequestType<ShowRuleDescriptionParams, any, void>('sonarlint/showRuleDescription');
}

export interface ShowRuleDescriptionParams {
  key: string;
  name: string;
  htmlDescription: string;
  type: string;
  severity: string;
  parameters?: Array<{
    name: string;
    description: string;
    defaultValue: string;
  }>;
}

export namespace GetJavaConfigRequest {
  export const type = new lsp.RequestType<string, GetJavaConfigResponse, void>('sonarlint/getJavaConfig');
}

export interface GetJavaConfigResponse {
  projectRoot: string;
  sourceLevel: string;
  classpath: string[];
  isTest: boolean;
  vmLocation: string;
}

export namespace ShowSonarLintOutput {
  export const type = new lsp.RequestType('sonarlint/showSonarLintOutput');
}

export namespace OpenJavaHomeSettings {
  export const type = new lsp.RequestType('sonarlint/openJavaHomeSettings');
}

export namespace OpenPathToNodeSettings {
  export const type = new lsp.RequestType('sonarlint/openPathToNodeSettings');
}

export namespace BrowseTo {
  export const type = new lsp.RequestType<string, void, void>('sonarlint/browseTo');
}

export namespace OpenConnectionSettings {
  export const type = new lsp.RequestType<boolean, void, void>(
    'sonarlint/openConnectionSettings'
  );
}

export enum HotspotResolution {
  Fixed,
  Safe
}

export enum HotspotProbability {
  High,
  Medium,
  Low
}

export enum HotspotStatus {
  ToReview,
  Reviewed
}

export interface RemoteHotspot {
  message: string;
  filePath: string;
  textRange: TextRange;
  author: string;
  status: HotspotStatus;
  resolution?: HotspotResolution;
  rule: {
    key: string;
    name: string;
    securityCategory: string;
    vulnerabilityProbability: HotspotProbability;
    riskDescription: string;
    vulnerabilityDescription: string;
    fixRecommendations: string;
  }
}

export namespace ShowHotspotRequest {
  export const type = new lsp.RequestType<RemoteHotspot, void, void>('sonarlint/showHotspot');
}

export interface TextRange {
  startLine: number;
  endLine?: number;
  startLineOffset?: number;
  endLineOffset?: number;
}

export interface Location {
  uri?: string;
  filePath: string;
  textRange: TextRange;
  message?: string;
  exists: boolean;
  codeMatches: boolean;
}

export interface Flow {
  locations: Location[]
}

export interface Issue {
  fileUri: string;
  message: string;
  severity: string;
  ruleKey: string;
  connectionId?: string;
  creationDate?: string;
  flows: Flow[];
}

export namespace ShowTaintVulnerabilityRequest {
  export const type = new lsp.RequestType<Issue, void, void>('sonarlint/showTaintVulnerability');
}
