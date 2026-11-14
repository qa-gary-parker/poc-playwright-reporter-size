// File reporters run beside 'dot', which Playwright adds itself under CI when the config has no terminal reporter.
// Runs a 2,000-test suite once per (reporter arm, failure rate, repeat) and records wall time and output size.
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const PLAYWRIGHT = '1.65.1';
const FILES = 100;
const PER_FILE = 20;
const FAIL_PCT = [0, 1, 5, 20];
const REPEATS = Number(process.env.REPEATS ?? 5);
const ARMS = ['dot', 'failures', 'json', 'json-only', 'junit', 'junit-only', 'html', 'html-only'];
const root = resolve(import.meta.dirname, '..');
const dir = join(root, 'work');

const config = `import { defineConfig } from '@playwright/test';
const out = process.env.OUT!;
const arms: Record<string, any[]> = {
  dot: [['dot']],
  failures: [['failures']],
  json: [['dot'], ['json', { outputFile: out + '/report.json' }]],
  'json-only': [['dot'], ['json', { outputFile: out + '/report.json', onlyFailures: true }]],
  junit: [['dot'], ['junit', { outputFile: out + '/report.xml' }]],
  'junit-only': [['dot'], ['junit', { outputFile: out + '/report.xml', onlyFailures: true }]],
  html: [['dot'], ['html', { outputFolder: out + '/html', open: 'never' }]],
  'html-only': [['dot'], ['html', { outputFolder: out + '/html', open: 'never', onlyFailures: true }]],
};
export default defineConfig({
  testDir: 'tests',
  fullyParallel: true,
  workers: 4,
  retries: 0,
  reporter: arms[process.env.ARM!],
});
`;

const helper = `import { test, expect } from '@playwright/test';
const FAIL_PCT = Number(process.env.FAIL_PCT ?? 0);
export function orderCase(g: number) {
  test(\`case \${String(g).padStart(4, '0')} checks the order total\`, async () => {
    const items = [{ sku: \`A-\${g}\`, price: 12.5, qty: 2 }, { sku: \`B-\${g}\`, price: 4, qty: 1 }, { sku: \`C-\${g}\`, price: 30, qty: 3 }];
    const order = await test.step('build the order', async () => {
      expect(items).toHaveLength(3);
      return { id: g, items, currency: 'GBP' };
    });
    const total = await test.step('apply the discount', async () => {
      const sum = order.items.reduce((s, i) => s + i.price * i.qty, 0);
      expect(sum).toBeGreaterThan(0);
      return sum * 0.9;
    });
    await test.step('compare the totals', async () => {
      const expected = { id: g, currency: 'GBP', total: g % 100 < FAIL_PCT ? 0 : total, lines: 3 };
      expect({ id: order.id, currency: order.currency, total, lines: order.items.length }).toEqual(expected);
    });
  });
}
`;

function setup() {
  if (!process.env.SKIP_INSTALL) rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, 'tests'), { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'work', private: true }));
  writeFileSync(join(dir, 'playwright.config.ts'), config);
  writeFileSync(join(dir, 'tests', 'order.ts'), helper);
  for (let f = 0; f < FILES; f++) {
    const cases = Array.from({ length: PER_FILE }, (_, t) => `orderCase(${f * PER_FILE + t});`).join('\n');
    writeFileSync(join(dir, 'tests', `orders-${String(f).padStart(3, '0')}.spec.ts`), `import { orderCase } from './order';\n${cases}\n`);
  }
  if (process.env.SKIP_INSTALL) return;
  execFileSync('npm', ['i', '--silent', '--no-audit', '--no-fund', `@playwright/test@${PLAYWRIGHT}`], { cwd: dir, stdio: 'inherit' });
}

function files(p) {
  if (!existsSync(p)) return [];
  if (statSync(p).isFile()) return [{ path: p, bytes: statSync(p).size }];
  return readdirSync(p).flatMap((n) => files(join(p, n)));
}

function run(arm, failPct, rep) {
  const out = join(dir, 'out', `${arm}-${failPct}`);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const start = process.hrtime.bigint();
  const r = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--output', join(out, 'test-results')], {
    cwd: dir, env: { ...process.env, ARM: arm, OUT: out, FAIL_PCT: String(failPct), CI: '1', FORCE_COLOR: '0' }, encoding: 'utf8', maxBuffer: 1 << 28,
  });
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  writeFileSync(join(out, 'stdout.txt'), r.stdout);
  const written = files(out).filter((f) => !f.path.includes('test-results') && !f.path.endsWith('stdout.txt'));
  const main = { json: 'report.json', 'json-only': 'report.json', junit: 'report.xml', 'junit-only': 'report.xml', html: 'html/index.html', 'html-only': 'html/index.html' }[arm];
  let testsInReport = null;
  if (arm.startsWith('json')) {
    const count = (s) => s.specs.length + (s.suites ?? []).reduce((n, c) => n + count(c), 0);
    testsInReport = JSON.parse(readFileSync(join(out, main), 'utf8')).suites.reduce((n, s) => n + count(s), 0);
  }
  if (arm.startsWith('junit')) testsInReport = (readFileSync(join(out, main), 'utf8').match(/<testcase /g) ?? []).length;
  return {
    arm, failPct, rep, exit: r.status, ms: Math.round(ms),
    stdoutBytes: Buffer.byteLength(r.stdout) + Buffer.byteLength(r.stderr),
    mainBytes: main ? statSync(join(out, main)).size : 0,
    totalBytes: written.reduce((n, f) => n + f.bytes, 0),
    fileCount: written.length,
    testsInReport,
  };
}

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

setup();
const results = [];
// Repeats are the outer loop so slow drift on the machine spreads over every arm.
for (let rep = 0; rep < REPEATS; rep++) for (const failPct of FAIL_PCT) for (const arm of ARMS) {
  const r = run(arm, failPct, rep);
  const wantExit = failPct ? 1 : 0;
  if (r.exit !== wantExit) throw new Error(`${arm} at ${failPct}%: exit ${r.exit}, expected ${wantExit}`);
  results.push(r);
  console.log(JSON.stringify(r));
}
mkdirSync(join(root, 'results'), { recursive: true });
writeFileSync(join(root, 'results', 'raw.json'), JSON.stringify(results, null, 1));

const rows = [];
for (const failPct of FAIL_PCT) {
  const base = median(results.filter((r) => r.arm === 'dot' && r.failPct === failPct).map((r) => r.ms));
  for (const arm of ARMS) {
    const rs = results.filter((r) => r.arm === arm && r.failPct === failPct);
    const ms = median(rs.map((r) => r.ms));
    rows.push({
      failPct, failed: FILES * PER_FILE * failPct / 100, arm, runs: rs.length,
      medianMs: ms, minMs: Math.min(...rs.map((r) => r.ms)), maxMs: Math.max(...rs.map((r) => r.ms)), overDotMs: ms - base,
      stdoutBytes: median(rs.map((r) => r.stdoutBytes)), mainBytes: median(rs.map((r) => r.mainBytes)), totalBytes: median(rs.map((r) => r.totalBytes)),
      fileCount: rs[0].fileCount, testsInReport: rs[0].testsInReport,
    });
  }
}
writeFileSync(join(root, 'results', 'summary.json'), JSON.stringify(rows, null, 1));
const md = ['| failed tests | arm | median ms | min-max ms | over dot ms | stdout bytes | report bytes | all files bytes | files | tests in report |', '|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.failed} | ${r.arm} | ${r.medianMs} | ${r.minMs}-${r.maxMs} | ${r.overDotMs} | ${r.stdoutBytes} | ${r.mainBytes} | ${r.totalBytes} | ${r.fileCount} | ${r.testsInReport ?? ''} |`)].join('\n');
writeFileSync(join(root, 'results', 'summary.md'), md + '\n');
console.log(`wrote ${results.length} runs`);
