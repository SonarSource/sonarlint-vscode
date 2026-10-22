/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Generated with the OpenJDK BlockedCertsConverter from:
// https://github.com/openjdk/jdk/commit/22bc7357ce6bc5f1ed2f1e83e0544b2c25f781d4
export function updateCertificateTrust(javaHome) {
  const blocklistPath = join(javaHome, 'lib', 'security', 'blocked.certs');
  const existing = readFileSync(blocklistPath, 'utf8');
  const updated = readFileSync(new URL('./blocked.certs', import.meta.url), 'utf8');
  for (const contents of [existing, updated]) {
    if (!/^Algorithm=SHA-256$/m.test(contents.replaceAll('\r', ''))) {
      throw new Error('Unsupported certificate blocklist algorithm');
    }
  }
  const fingerprints = [...new Set(`${existing}\n${updated}`
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => /^[A-F0-9]{64}$/.test(line)))].sort();
  writeFileSync(blocklistPath, `Algorithm=SHA-256\n${fingerprints.join('\n')}\n`);
}
