import { spawn } from 'node:child_process';

const npmCli = process.env.npm_execpath;
if (!npmCli) {
  throw new Error('Run the development servers with `npm run dev` from the repository root.');
}

const workspaces = ['backend', 'frontend'];
const children = workspaces.map((workspace) =>
  spawn(process.execPath, [npmCli, 'run', 'dev', '--workspace', workspace], {
    stdio: 'inherit',
    env: process.env,
  }),
);
let shuttingDown = false;

function stop(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;
  process.exitCode = exitCode;
  for (const child of children) {
    if (child.exitCode === null) child.kill();
  }
}

for (const child of children) {
  child.on('error', (error) => {
    console.error('Could not start a development workspace:', error);
    stop(1);
  });
  child.on('exit', (code) => {
    if (!shuttingDown) stop(code ?? 1);
  });
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
