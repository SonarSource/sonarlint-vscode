/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { updateCertificateTrust } from './certificateTrust.mjs';

function runtime(t, contents) {
  const javaHome = mkdtempSync(join(tmpdir(), 'certificate-trust-'));
  t.after(() => rmSync(javaHome, { recursive: true, force: true }));
  const security = join(javaHome, 'lib', 'security');
  mkdirSync(security, { recursive: true });
  const blocklist = join(security, 'blocked.certs');
  if (contents !== undefined) {
    writeFileSync(blocklist, contents);
  }
  return { javaHome, blocklist };
}

await test('merges current trust data and preserves existing blocks on all platforms', t => {
  const additional = 'A'.repeat(64);
  const { javaHome, blocklist } = runtime(t, `Algorithm=SHA-256\r\n${additional}\r\n`);
  updateCertificateTrust(javaHome);
  const updated = readFileSync(blocklist, 'utf8');
  assert.ok(updated.includes(additional));
  const upstream = readFileSync(new URL('./blocked.certs', import.meta.url), 'utf8');
  for (const line of upstream.trim().split(/\r?\n/)) {
    assert.ok(updated.includes(line));
  }
  updateCertificateTrust(javaHome);
  assert.equal(readFileSync(blocklist, 'utf8'), updated);
});

await test('fails packaging when the runtime blocklist is missing', t => {
  const { javaHome } = runtime(t);
  assert.throws(() => updateCertificateTrust(javaHome), { code: 'ENOENT' });
});

await test('preserves the original file when its hash algorithm is unsupported', t => {
  const original = 'Algorithm=SHA-512\n';
  const { javaHome, blocklist } = runtime(t, original);
  assert.throws(() => updateCertificateTrust(javaHome), /Unsupported certificate blocklist/);
  assert.equal(readFileSync(blocklist, 'utf8'), original);
});
