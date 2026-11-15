import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectDir = path.resolve(backendDir, '..');
const roots = [
  path.join(backendDir, 'src'),
  path.join(backendDir, 'tests'),
  path.join(backendDir, 'scripts'),
  path.join(projectDir, 'shared', 'module', 'src'),
  path.join(projectDir, 'shared', 'module', 'db-signup.js'),
];

function collectJavaScript(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const stat = fs.statSync(filePath);
  if (stat.isFile()) return filePath.endsWith('.js') ? [filePath] : [];
  return fs.readdirSync(filePath, { withFileTypes: true })
    .flatMap((entry) => collectJavaScript(path.join(filePath, entry.name)));
}

const files = roots.flatMap(collectJavaScript);
let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed = true;
    process.stderr.write(result.stderr || result.stdout);
  }
}

if (failed) process.exitCode = 1;
else console.log(`Syntax checked ${files.length} backend and shared JavaScript files.`);
