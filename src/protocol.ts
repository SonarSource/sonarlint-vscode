/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2020 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as lsp from 'vscode-languageserver-protocol';

export namespace ShowRuleDescriptionRequest {
  export const type = new lsp.RequestType<ShowRuleDescriptionParams, any, void, void>('sonarlint/showRuleDescription');
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
  export const type = new lsp.RequestType<string, GetJavaConfigResponse, void, void>('sonarlint/getJavaConfig');
}

export interface GetJavaConfigResponse {
  projectRoot: string;
  sourceLevel: string;
  classpath: string[];
  isTest: boolean;
}

export namespace ShowSonarLintOutput {
  export const type = new lsp.RequestType('sonarlint/showSonarLintOutput');
}

export namespace OpenJavaHomeSettings {
  export const type = new lsp.RequestType('sonarlint/openJavaHomeSettings');
}
