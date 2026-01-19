/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

/**
 * Recording folder structure:
 * <OS temp>/sonarlint-flight-recordings/recording-<timestamp>/
 *   ├── diagnostics/
 *   │   ├── thread-dump-<timestamp>.txt
 *   │   └── heap-dump-<timestamp>.hprof
 */

export async function createRecordingFolder(): Promise<string> {
  const timestamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
  const recordingFolder = path.join(os.tmpdir(), 'sonarlint-flight-recordings', `recording-${timestamp}`);

  await fs.promises.mkdir(recordingFolder, { recursive: true });
  await fs.promises.mkdir(path.join(recordingFolder, 'diagnostics'), { recursive: true });

  return recordingFolder;
}

export function getRecordingDiagnosticsPath(recordingFolder: string): string {
  return path.join(recordingFolder, 'diagnostics');
}
