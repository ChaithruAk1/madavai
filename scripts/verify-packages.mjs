#!/usr/bin/env node
// Verify the whole TypeScript spine on any machine. Self-heals a wrong-platform or partial
// node_modules (e.g. one installed on a different OS): it is removed and reinstalled natively.
// Installs -> builds -> tests each package in dependency order. One command, no global tooling.
import { execSync } from 'node:child_process';
import { readdirSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = 'packages';
const order = ['contracts', 'insight', 'core', 'documents']; // dependency order (documents consumes contracts)
const all = readdirSync(root).filter((p) => existsSync(join(root, p, 'package.json')));
const pkgs = [...order.filter((p) => all.includes(p)), ...all.filter((p) => !order.includes(p))];
const isWin = process.platform === 'win32';
const run = (cmd, cwd) => execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

let failed = 0;
for (const p of pkgs) {
  const dir = join(root, p);
  const nm = join(dir, 'node_modules');
  const tscBin = join(nm, '.bin', isWin ? 'tsc.cmd' : 'tsc');
  try {
    if (existsSync(nm) && !existsSync(tscBin)) {
      process.stdout.write(`• @madav/${p}: removing wrong-platform node_modules…\n`);
      rmSync(nm, { recursive: true, force: true });
    }
    if (!existsSync(nm)) {
      process.stdout.write(`• @madav/${p}: installing dependencies (first run)…\n`);
      run('npm install --no-audit --no-fund --silent', dir);
    }
    const pj = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    if (pj.scripts && pj.scripts.build) run('npm run build', dir); // produce dist so dependents resolve
    const out = run('npm test', dir);
    const m = out.match(/# pass (\d+)[\s\S]*?# fail (\d+)/);
    console.log(`✓ @madav/${p}` + (m ? ` (pass ${m[1]}, fail ${m[2]})` : ' (ran)'));
  } catch (e) {
    failed++;
    console.log(`✗ @madav/${p} FAILED`);
    console.log(((e.stdout || '') + (e.stderr || '')).split('\n').filter(Boolean).slice(-12).join('\n'));
  }
}
console.log(failed ? `\n${failed} package(s) failed` : `\nAll ${pkgs.length} spine packages green`);
process.exit(failed ? 1 : 0);
