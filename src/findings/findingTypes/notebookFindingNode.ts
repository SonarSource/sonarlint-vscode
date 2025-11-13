/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { Diagnostic } from "vscode-languageclient";
import { FindingNode } from "./findingNode";
import { FindingType } from "../findingsTreeDataProviderUtil";

export class NotebookFindingNode extends FindingNode {
  constructor(
    fileUri: string,
    finding: Diagnostic
  ) {
    super(fileUri, FindingType.Issue, finding);
    this.contextValue = 'notebookIssueItem';
  }
}
