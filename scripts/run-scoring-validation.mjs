import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { historicalScoringWorkspace } from './historical-scoring-workspace.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Node.js 24 or later is required');
const args = process.argv.slice(2);
if (args.some(a => a !== '--research-grid')) throw new Error('Usage: node scripts/run-scoring-validation.mjs [--research-grid]');
const tests = [
  'scripts/test-historical-scoring-workspace.mjs',
  'scripts/test-unit-display.mjs',
  'scripts/test-unit-observations.mjs', 'scripts/test-passive-stat-rounding.mjs',
  'scripts/test-passive-target-priority.mjs', 'scripts/test-support-stacking.mjs',
  'scripts/test-generic-order.mjs', 'scripts/test-song-representative-order.mjs',
  'analysis/unit-score/probe-fixed-constants.mjs', 'scripts/test-scoring-handoff.mjs',
  'scripts/test-validation-aj-handoff.mjs',
  'scripts/test-validation-ak.mjs',
  'scripts/test-validation-al-plan.mjs',
  'scripts/test-validation-al.mjs',
  'scripts/test-validation-am-an.mjs',
  'scripts/test-validation-ao.mjs',
  'scripts/test-validation-ap-plan.mjs',
  'scripts/test-validation-ap.mjs',
  'scripts/test-validation-aq-plan.mjs',
  'scripts/test-validation-aq.mjs',
  'scripts/test-validation-ar-plan.mjs',
  'scripts/test-validation-ar.mjs',
  'scripts/test-validation-as-plan.mjs',
  'scripts/test-validation-as.mjs',
  'scripts/test-validation-at-plan.mjs',
  'scripts/test-validation-at.mjs',
  'scripts/test-validation-ar-reconfirmation.mjs',
  'scripts/test-validation-expanded-at.mjs',
  'scripts/test-validation-challenges-av-ax.mjs',
  'scripts/test-validation-aw.mjs',
  'scripts/test-validation-av-ax-ay.mjs',
  'scripts/test-validation-az.mjs',
];
if (args.includes('--research-grid')) tests.push(...[
  'probe-dummy-active-joint.mjs', 'probe-dummy-environment.mjs', 'probe-dummy-identifiability.mjs',
].map(p => `analysis/unit-score/${p}`));
const historicalRoot = historicalScoringWorkspace(root);
const historicalStart = tests.indexOf('analysis/unit-score/probe-fixed-constants.mjs');
for (const [index, script] of tests.entries()) {
  const cwd = index >= historicalStart ? historicalRoot : root;
  console.log(`[scoring-validation] ${script}`);
  const result = spawnSync(process.execPath, [path.join(cwd, script)], { cwd, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    process.stderr.write(result.stdout ?? ''); process.stderr.write(result.stderr ?? '');
    throw result.error ?? new Error(`${script} failed (${result.status ?? result.signal})`);
  }
  if (!script.includes('/probe-')) process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
}
const verification = spawnSync(process.execPath, [path.join(historicalRoot, 'scripts/test-research-reproduction.mjs'),
  ...(args.includes('--research-grid') ? ['--grid'] : [])], { cwd: historicalRoot, stdio: 'inherit' });
if (verification.error || verification.status !== 0) throw verification.error ?? new Error('Research reproduction failed');
fs.cpSync(path.join(historicalRoot, '.local/scoring-validation/research'), path.join(root, '.local/scoring-validation/research'), { recursive: true });
console.log('[scoring-validation] OK. Current production regressions and archived v0.9 research passed separately; AX remains a 0.1pp mismatch.');
