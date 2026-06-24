#!/usr/bin/env node
// Verify the whole TypeScript spine on any machine. Self-heals a wrong-platform/partial node_modules.
// Installs -> builds -> tests each package in dependency order across packages/ and services/.
import { execSync } from 'node:child_process';
import { readdirSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const roots = ['packages', 'services'];
const order = ['contracts', 'insight', 'storage', 'core', 'documents', 'cloud', 'sync', 'models']; // dependency order
const dirs = roots.flatMap((root) =>
  existsSync(root) ? readdirSync(root).filter((p) => existsSync(join(root, p, 'package.json'))).map((p) => ({ name: p, dir: join(root, p) })) : [],
);
const rank = (n) => { const i = order.indexOf(n); return i < 0 ? order.length : i; };
const pkgs = dirs.sort((a, b) => rank(a.name) - rank(b.name));
const isWin = process.platform === 'win32';
const run = (cmd, cwd) => execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

let failed = 0;
for (const { name, dir } of pkgs) {
  const nm = join(dir, 'node_modules');
  const tscBin = join(nm, '.bin', isWin ? 'tsc.cmd' : 'tsc');
  try {
    if (existsSync(nm) && !existsSync(tscBin)) { process.stdout.write(`• @madav/${name}: removing wrong-platform node_modules…\n`); rmSync(nm, { recursive: true, force: true }); }
    if (!existsSync(nm)) { process.stdout.write(`• @madav/${name}: installing dependencies…\n`); run('npm install --no-audit --no-fund --silent', dir); }
    const pj = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    if (pj.scripts && pj.scripts.build) run('npm run build', dir);
    const out = run('npm test', dir);
    const m = out.match(/# pass (\d+)[\s\S]*?# fail (\d+)/);
    console.log(`✓ @madav/${name}` + (m ? ` (pass ${m[1]}, fail ${m[2]})` : ' (ran)'));
  } catch (e) {
    failed++; console.log(`✗ @madav/${name} FAILED`);
    console.log(((e.stdout || '') + (e.stderr || '')).split('\n').filter(Boolean).slice(-12).join('\n'));
  }
}
console.log(failed ? `\n${failed} package(s) failed` : `\nAll ${pkgs.length} spine packages green`);
process.exit(failed ? 1 : 0);
