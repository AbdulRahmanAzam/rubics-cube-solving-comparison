// Spawns a headless CLI with the prompt on stdin (stdin closed afterwards, so nothing waits
// for more input), from an empty working directory outside any repo (no CLAUDE.md / AGENTS.md).
import { spawn, execFile } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TransportError } from './errors.js';

export const SANDBOX_DIR = path.join(os.tmpdir(), 'rubiks-race-sandbox');
mkdirSync(SANDBOX_DIR, { recursive: true });

function killTree(child) {
  if (process.platform === 'win32') execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], () => {});
  else child.kill('SIGKILL');
}

// onLine(line, msSinceSpawn) is called for every stdout line as it arrives.
export function runCli({ cmd, args, input, timeoutMs, onLine, env }) {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const child = spawn(cmd, args, {
      cwd: SANDBOX_DIR,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env, ...env },
    });
    let stdout = '';
    let stderr = '';
    let buf = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, timeoutMs);

    child.stdout.on('data', (d) => {
      const s = d.toString();
      stdout += s;
      if (!onLine) return;
      buf += s;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line) onLine(line, performance.now() - started);
      }
    });
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new TransportError(`spawn failed: ${err.message}`, { retryable: false }));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (buf.trim() && onLine) onLine(buf.trim(), performance.now() - started);
      const wallMs = performance.now() - started;
      if (timedOut) return reject(new TransportError(`timeout after ${timeoutMs} ms`));
      resolve({ code, stdout, stderr, wallMs });
    });

    child.stdin.end(input);
  });
}
