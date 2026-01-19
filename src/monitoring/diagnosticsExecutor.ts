/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as path from 'node:path';
import * as fs from 'node:fs';

const execFileAsync = promisify(execFile);

/**
 * Check if a tool exists at the given path.
 */
async function toolExists(toolPath: string): Promise<boolean> {
  try {
    await fs.promises.access(toolPath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the path to a JDK tool, adding .exe extension on Windows.
 */
function getToolPath(javaHome: string, toolName: string): string {
  const binDir = path.join(javaHome, 'bin');
  const toolPath = path.join(binDir, toolName);

  if (process.platform === 'win32') {
    return `${toolPath}.exe`;
  }

  return toolPath;
}

/**
 * Capture a thread dump using jstack.
 * @param javaHome Path to the Java home directory
 * @param pid Process ID of the target JVM
 * @param outputPath Path where the thread dump will be saved
 * @throws Error if jstack is not found, PID is invalid, or execution fails
 */
export async function captureThreadDump(javaHome: string, pid: number, outputPath: string): Promise<void> {
  const jstackPath = getToolPath(javaHome, 'jstack');

  if (!(await toolExists(jstackPath))) {
    throw new Error(`jstack not found at ${jstackPath}. Please ensure JDK is properly installed.`);
  }

  try {
    const { stdout, stderr } = await execFileAsync(jstackPath, ['-l', pid.toString()], {
      timeout: 30000
    });

    await fs.promises.writeFile(outputPath, stdout, 'utf8');

    if (stderr) {
      console.warn(`jstack stderr: ${stderr}`);
    }
  } catch (error) {
    if (error.killed) {
      throw new Error('Thread dump capture timed out after 30 seconds');
    }
    throw new Error(`Failed to capture thread dump: ${error.message}`);
  }
}

/**
 * Capture a heap dump using jcmd.
 * @param javaHome Path to the Java home directory
 * @param pid Process ID of the target JVM
 * @param outputPath Path where the heap dump will be saved
 * @throws Error if jcmd is not found, PID is invalid, or execution fails
 */
export async function captureHeapDump(javaHome: string, pid: number, outputPath: string): Promise<void> {
  const jcmdPath = getToolPath(javaHome, 'jcmd');

  if (!(await toolExists(jcmdPath))) {
    throw new Error(`jcmd not found at ${jcmdPath}. Please ensure JDK is properly installed.`);
  }

  try {
    const { stdout, stderr } = await execFileAsync(jcmdPath, [pid.toString(), 'GC.heap_dump', outputPath], {
      timeout: 120000
    });

    if (!stdout.includes('Heap dump file created')) {
      throw new Error(`Heap dump may have failed. Output: ${stdout}`);
    }

    if (stderr) {
      console.warn(`jcmd stderr: ${stderr}`);
    }
  } catch (error) {
    if (error.killed) {
      throw new Error('Heap dump capture timed out after 2 minutes');
    }
    throw new Error(`Failed to capture heap dump: ${error.message}`);
  }
}
