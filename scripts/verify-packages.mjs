#!/usr/bin/env node
// Verify the whole TypeScript spine: type-check + run tests for every package under packages/.
import { execSync } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = 'packages';
const pkgs = readdirSync(root).filter((p) => existsSync(join(root, p, 'package.json')));
let failed = 0;
for (const p of pkgs) {
  try {
    const out = execSync('npm test', { cwd: join(root, p), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const m = out.match(/# pass (\d+)[\s\S]*?# fail (\d+)/);
    console.log(`✓ @madav/${p}` + (m ? ` (pass ${m[1]}, fail ${m[2]})` : ' (ran)'));
  } catch (e) {
    failed++;
    console.log(`✗ @madav/${p} FAILED`);
    console.log(((e.stdout || '') + (e.stderr || '')).split('\n').slice(-10).join('\n'));
  }
}
console.log(failed ? `\n${failed} package(s) failed` : `\nAll ${pkgs.length} spine packages green`);
process.exit(failed ? 1 : 0);
