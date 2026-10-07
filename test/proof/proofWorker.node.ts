import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  applyLineEdits,
  candidatePatch,
  isVerified,
  projectDigest,
  snapshot
} from '../../src/fixSuggestions/proofWorker';

const edit = (startLine: number, endLine: number, after: string) => ({
  beforeLineRange: { startLine, endLine },
  after
});
test('CodeFix inclusive ranges preserve final EOL and CRLF', () => {
  assert.equal(applyLineEdits('a\nb\nc\n', [edit(2, 2, 'B'), edit(3, 3, 'C')]), 'a\nB\nC\n');
  assert.equal(applyLineEdits('a\r\nb\r\n', [edit(1, 2, 'A\nB')]), 'A\r\nB\r\n');
  assert.equal(applyLineEdits('a\nb', [edit(2, 2, 'B')]), 'a\nB');
  assert.throws(() => applyLineEdits('a\nb', [edit(0, 1, 'bad')]));
  assert.throws(() => applyLineEdits('a\nb', [edit(1, 2, 'bad'), edit(2, 2, 'bad')]));
});
test('acceptance requires the aggregate gate and every helper proof', () => {
  const report = {
    stage: 'verified_models',
    claimScope: 'lean_models',
    mechanicalChecksPassed: true,
    targets: [{ verdict: 'verified', helperProofs: [] }]
  };
  assert.equal(isVerified(report), true);
  assert.equal(isVerified({ ...report, stage: 'unproven' }), false);
  assert.equal(isVerified({ ...report, mechanicalChecksPassed: false }), false);
  assert.equal(
    isVerified({ ...report, targets: [{ verdict: 'verified', helperProofs: [{ verdict: 'unproven' }] }] }),
    false
  );
  assert.equal(isVerified({ ...report, targets: [report.targets[0], report.targets[0]] }), false);
});
test('snapshot and stale-source guard cover manifests, additions and source bytes', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'sonar-proof-test-'));
  try {
    const root = path.join(temp, 'project'),
      baseline = path.join(temp, 'baseline');
    await fs.mkdir(root);
    await fs.writeFile(path.join(root, 'Cargo.toml'), '[package]');
    await fs.writeFile(path.join(root, 'lib.rs'), 'original');
    const digest = await snapshot(root, baseline);
    assert.equal(await projectDigest(baseline), digest);
    await fs.writeFile(path.join(root, 'new.rs'), 'new');
    assert.notEqual(await projectDigest(root), digest);
    await fs.rm(path.join(root, 'new.rs'));
    await fs.writeFile(path.join(root, 'Cargo.toml'), 'changed');
    assert.notEqual(await projectDigest(root), digest);
    assert.throws(() => candidatePatch('lib.rs', 'same', 'same'));
    assert.match(candidatePatch('lib.rs', 'original\n', 'candidate\n'), /--- a\/lib.rs/);
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
});
