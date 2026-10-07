/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import { createHash, randomUUID } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createTwoFilesPatch } from 'diff';

export interface LineEdit {
  beforeLineRange: { startLine: number; endLine: number };
  after: string;
}

// Matches the existing CodeFix client's inclusive line ranges, excluding the last EOL.
export function applyLineEdits(source: string, edits: LineEdit[]): string {
  const lines = source.split('\n');
  const offsets = [0];
  for (let i = 0; i < lines.length - 1; i++) offsets.push(offsets[i] + lines[i].length + 1);
  const ranges = edits
    .map(edit => {
      const { startLine: start, endLine: end } = edit.beforeLineRange;
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > lines.length) {
        throw new Error('Invalid CodeFix line range');
      }
      return {
        start: offsets[start - 1],
        end: offsets[end - 1] + lines[end - 1].replace(/\r$/, '').length,
        text: (edit.after ?? '').replace(/\r?\n/g, source.includes('\r\n') ? '\r\n' : '\n')
      };
    })
    .sort((a, b) => b.start - a.start);
  let lastStart = source.length + 1;
  for (const edit of ranges) {
    if (edit.end >= lastStart) throw new Error('Overlapping CodeFix edits');
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
    lastStart = edit.start;
  }
  return source;
}

export function candidatePatch(file: string, before: string, after: string): string {
  if (before === after) throw new Error('CodeFix returned no change');
  return createTwoFilesPatch(`a/${file}`, `b/${file}`, before, after, '', '', { context: 3 });
}

export function isVerified(result: any): boolean {
  return (
    result?.stage === 'verified_models' &&
    result.claimScope === 'lean_models' &&
    result.mechanicalChecksPassed === true &&
    result.targets?.length === 1 &&
    result.targets.every(
      t =>
        t.verdict === 'verified' && Array.isArray(t.helperProofs) && t.helperProofs.every(h => h.verdict === 'verified')
    )
  );
}

const EXCLUDED = new Set(['.git', 'target', 'node_modules', '.vscode', '.idea', '.env']);
export async function projectDigest(root: string): Promise<string> {
  const hash = createHash('sha256');
  let count = 0;
  let bytes = 0;
  async function visit(directory: string) {
    for (const entry of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name)
    )) {
      if (EXCLUDED.has(entry.name) || entry.name.startsWith('.env.')) continue;
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Demo supports Cargo projects without symlinks');
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile()) {
        const data = await fs.readFile(file);
        bytes += data.length;
        if (++count > 5000 || bytes > 20_000_000) throw new Error('Demo supports small Cargo projects (up to 20 MB)');
        hash.update(JSON.stringify(path.relative(root, file)));
        hash.update(String(data.length));
        hash.update(data);
      }
    }
  }
  await visit(root);
  return hash.digest('hex');
}

export interface Cancellation {
  isCancellationRequested: boolean;
  onCancellationRequested(listener: () => void): { dispose(): void };
}

export async function docker(
  args: string[],
  token: Cancellation,
  timeoutMs = 600_000
): Promise<{ code: number; stdout: string }> {
  if (token.isCancellationRequested) throw new Error('Verification cancelled');
  const container = `sonar-proof-${randomUUID()}`;
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['run', '--name', container, '--rm', '--network', 'none', ...args], { shell: false });
    let stdout = '',
      stderr = '',
      stopped = false;
    const stop = () => {
      stopped = true;
      const cleanup = spawn('docker', ['rm', '-f', container], { stdio: 'ignore', shell: false });
      cleanup.on('error', () => {});
      child.kill();
    };
    const cancel = token.onCancellationRequested(stop);
    const timer = setTimeout(stop, timeoutMs);
    child.stdout.on('data', data => {
      stdout = (stdout + data).slice(-2_000_000);
    });
    child.stderr.on('data', data => {
      stderr = (stderr + data).slice(-10_000);
    });
    child.on('error', error => {
      clearTimeout(timer);
      cancel.dispose();
      reject(error);
    });
    child.on('close', code => {
      clearTimeout(timer);
      cancel.dispose();
      if (stopped) reject(new Error('Verification cancelled or timed out'));
      else if (!stdout.trim()) reject(new Error(`Verifier failed: ${stderr}`));
      else resolve({ code: code ?? 1, stdout });
    });
  });
}

export async function snapshot(project: string, directory: string): Promise<string> {
  const digest = await projectDigest(project);
  await fs.cp(project, directory, {
    recursive: true,
    filter: source =>
      !path
        .relative(project, source)
        .split(path.sep)
        .some(part => EXCLUDED.has(part) || part.startsWith('.env.'))
  });
  if ((await projectDigest(directory)) !== digest || (await projectDigest(project)) !== digest) {
    throw new Error('Project changed while capturing the original. Save files and retry.');
  }
  return digest;
}

export async function prepare(job: string, image: string, target: object, token: Cancellation): Promise<any> {
  await fs.writeFile(path.join(job, 'request.json'), JSON.stringify({ schemaVersion: 1, targets: [target] }));
  const response = await docker(
    [
      '-v',
      `${job}:/state`,
      '-v',
      `${job}/baseline:/baseline:ro`,
      '-v',
      `${job}/request.json:/request.json:ro`,
      image,
      'prepare-verification',
      '--baseline',
      '/baseline',
      '--request',
      '/request.json',
      '--contexts',
      '/state/contexts',
      '--workspace-setup',
      '/opt/verification/workspace-setup/target/release/workspace-setup'
    ],
    token
  );
  const result = JSON.parse(response.stdout);
  await fs.writeFile(path.join(job, 'preparation.json'), JSON.stringify(result, null, 2));
  if (response.code !== 0 || result.stage !== 'prepared' || !result.eligible) {
    throw new Error(`Function not eligible for this verifier: ${result.detail ?? result.stage}`);
  }
  return result;
}

export async function verify(
  job: string,
  image: string,
  context: any,
  patch: string,
  token: Cancellation
): Promise<any> {
  await fs.writeFile(path.join(job, 'candidate.diff'), patch);
  const response = await docker(
    [
      '-v',
      `${job}:/state`,
      '-v',
      `${job}/contexts:/state/contexts:ro`,
      '-v',
      `${job}/candidate.diff:/input.patch:ro`,
      image,
      'verify-candidate',
      '--contexts',
      '/state/contexts',
      '--context-id',
      context.contextId,
      '--context-digest',
      context.contextDigest,
      '--patch',
      '/input.patch',
      '--out',
      '/state/result',
      '--max-proof-seconds',
      '120'
    ],
    token
  );
  const result = JSON.parse(response.stdout);
  // Bind the result to the bytes presented to the user and the prepared original.
  if (
    result.patchSha256 !== createHash('sha256').update(patch).digest('hex') ||
    result.contextDigest !== context.contextDigest ||
    result.baselineDigest !== context.baselineDigest
  ) {
    throw new Error('Verifier report does not match this candidate and original');
  }
  if (response.code !== 0 && isVerified(result)) throw new Error('Inconsistent verifier exit status');
  return result;
}

export async function resolveImage(image: string): Promise<string> {
  const { stdout } = await promisify(execFile)('docker', ['image', 'inspect', '--format', '{{.Id}}', image]);
  const id = stdout.trim();
  if (!/^sha256:[a-f0-9]{64}$/.test(id)) throw new Error('Cannot resolve local verification image');
  return id;
}

export async function analyze(job: string, image: string, file: string, token: Cancellation): Promise<any> {
  const response = await docker(
    [
      '--entrypoint',
      '/opt/verification/cogc/target/release/cogc',
      '-v',
      `${job}/baseline:/baseline:ro`,
      image,
      `/baseline/${file}`
    ],
    token
  );
  if (response.code !== 0) throw new Error('Cannot analyze the selected Rust source');
  return JSON.parse(response.stdout);
}
