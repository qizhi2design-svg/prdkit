import { spawn } from 'node:child_process';

const isWindows = process.platform === 'win32';
const pnpmCommand = isWindows ? 'pnpm.cmd' : 'pnpm';

const children = [
  spawn(pnpmCommand, ['run', 'dev:viewer'], {
    stdio: 'inherit',
  }),
  spawn(pnpmCommand, ['run', 'dev:cli'], {
    stdio: 'inherit',
  }),
];

let shuttingDown = false;

function shutdown(signal = 'SIGTERM') {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill(signal);
    }
  }
}

for (const child of children) {
  child.on('exit', (code, signal) => {
    if (!shuttingDown) {
      shutdown();

      if (signal) {
        process.kill(process.pid, signal);
        return;
      }

      process.exit(code ?? 0);
    }
  });

  child.on('error', (error) => {
    console.error(error);
    shutdown();
    process.exit(1);
  });
}

process.on('SIGINT', () => {
  shutdown('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  shutdown('SIGTERM');
  process.exit(0);
});
