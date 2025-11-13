/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { FindingsFileNode } from "./findingsFileNode";

export class NotebookNode extends FindingsFileNode {
 constructor(
    public readonly fileUri: string,
    public readonly findingsCount: number,
    public readonly category?: 'new' | 'older',
    public readonly notebookCellUris?: string[]
  ) {
    super(fileUri, findingsCount, category);
  }
}
