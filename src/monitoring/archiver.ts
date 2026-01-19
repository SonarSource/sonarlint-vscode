/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as AdmZip from 'adm-zip';
import * as path from 'node:path';
import * as fs from 'node:fs';

export async function createRecordingArchive(recordingFolder: string): Promise<string> {
  try {
    const folderStats = await fs.promises.stat(recordingFolder);
    if (!folderStats.isDirectory()) {
      throw new Error(`Recording folder does not exist or is not a directory: ${recordingFolder}`);
    }

    const zip = new AdmZip();

    zip.addLocalFolder(recordingFolder, path.basename(recordingFolder));

    const timestamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
    const archiveName = `sonarlint-recording-${timestamp}.zip`;

    const parentDir = path.dirname(recordingFolder);
    const outputPath = path.join(parentDir, archiveName);

    zip.writeZip(outputPath);

    await fs.promises.access(outputPath);

    return outputPath;
  } catch (error) {
    throw new Error(`Failed to create recording archive: ${error.message}`);
  }
}
