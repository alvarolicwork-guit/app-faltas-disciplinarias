/* eslint-disable @typescript-eslint/no-require-imports */
const { spawn } = require('node:child_process');
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3318'], { windowsHide: true });
let started = false;
const timeout = setTimeout(() => { console.error('Startup timeout'); server.kill(); process.exitCode = 1; }, 30000);
server.stderr.on('data', chunk => process.stderr.write(chunk));
server.stdout.on('data', async chunk => {
  process.stdout.write(chunk);
  if (!started && chunk.toString().includes('Ready')) {
    started = true;
    clearTimeout(timeout);
    process.env.AUDIT_BASE_URL = 'http://127.0.0.1:3318';
    try { await require('./http-smoke.cjs'); } finally { server.kill(); }
  }
});
