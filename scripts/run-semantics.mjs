// Records which test outcomes onlyFailures keeps, and what it does to merged reports and to a tool that reads durations.
// Needs work/ from run-matrix.mjs.
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const BALANCER = '0.1.3';
const root = resolve(import.meta.dirname, '..');
const work = join(root, 'work');
const dir = join(work, 'semantics');
const cli = join(work, 'node_modules', '@playwright', 'test', 'cli.js');
const { chromium } = createRequire(join(work, 'package.json'))('@playwright/test');

const OUTCOMES = ['passes', 'fails', 'passes on retry', 'is skipped', 'is fixme', 'fails as expected', 'passes but should fail', 'times out'];
const spec = `import { test, expect } from '@playwright/test';
test('passes', async () => { expect(1).toBe(1); });
test('fails', async () => { expect(1).toBe(2); });
test('passes on retry', async ({}, testInfo) => { expect(testInfo.retry).toBe(1); });
test('is skipped', async () => { test.skip(); });
test.fixme('is fixme', async () => {});
test('fails as expected', async () => { test.fail(); expect(1).toBe(2); });
test('passes but should fail', async () => { test.fail(); expect(1).toBe(1); });
test('times out', async () => { test.setTimeout(300); await new Promise((r) => setTimeout(r, 5000)); });
`;
const config = `import { defineConfig } from '@playwright/test';
const out = process.env.OUT!;
const only = process.env.ONLY === '1';
const reporters: Record<string, any[]> = {
  files: [['dot'], ['json', { outputFile: out + '/report.json', onlyFailures: only }], ['junit', { outputFile: out + '/report.xml', onlyFailures: only }], ['html', { outputFolder: out + '/html', open: 'never', onlyFailures: only }]],
  blob: [['dot'], ['blob', { outputDir: out + '/blob' }]],
};
export default defineConfig({ testDir: 'tests', workers: 2, retries: 1, reporter: reporters[process.env.REPORTERS ?? 'files'] });
`;
const mergeConfig = `export default { reporter: [['json', { outputFile: process.env.OUT + '/merged.json', onlyFailures: true }]] };\n`;

rmSync(dir, { recursive: true, force: true });
mkdirSync(join(dir, 'tests'), { recursive: true });
writeFileSync(join(dir, 'tests', 'outcomes.spec.ts'), spec);
writeFileSync(join(dir, 'playwright.config.ts'), config);
writeFileSync(join(dir, 'merge.config.ts'), mergeConfig);
execFileSync('npm', ['i', '--silent', '--no-audit', '--no-fund', `playwright-shard-balancer@${BALANCER}`], { cwd: work, stdio: 'inherit' });

const pw = (args, env, cwd = dir) => spawnSync(process.execPath, [cli, ...args], { cwd, env: { ...process.env, CI: '1', FORCE_COLOR: '0', ...env }, encoding: 'utf8', maxBuffer: 1 << 28 });
const jsonTitles = (file) => {
  const walk = (s) => [...s.specs.map((x) => x.title), ...(s.suites ?? []).flatMap(walk)];
  const report = JSON.parse(readFileSync(file, 'utf8'));
  return { titles: report.suites.flatMap(walk), stats: (({ expected, skipped, unexpected, flaky }) => ({ expected, skipped, unexpected, flaky }))(report.stats) };
};
const junit = (file) => {
  const xml = readFileSync(file, 'utf8');
  const head = xml.match(/<testsuites [^>]*>/)[0];
  const attr = (n) => Number(head.match(new RegExp(` ${n}="(\\d+)"`))[1]);
  return { titles: [...xml.matchAll(/<testcase name="([^"]+)"/g)].map((m) => m[1]), totals: { tests: attr('tests'), failures: attr('failures'), skipped: attr('skipped'), errors: attr('errors') } };
};

const browser = await chromium.launch();
const htmlTitles = async (file) => {
  const page = await browser.newPage();
  await page.goto(`file://${file}`);
  await page.waitForFunction(() => document.querySelector('.subnav-item, .header-view'), null, { timeout: 30000 });
  await page.waitForTimeout(500);
  const text = await page.evaluate(() => document.body.innerText);
  const counters = await page.evaluate(() => [...document.querySelectorAll('.subnav-item')].map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
  await page.close();
  return { titles: OUTCOMES.filter((t) => text.split('\n').some((l) => l.trim() === t)), counters };
};

const result = { outcomes: OUTCOMES, modes: {} };
for (const [mode, env] of Object.entries({ full: { ONLY: '0' }, onlyFailures: { ONLY: '1' }, envVar: { ONLY: '0', PLAYWRIGHT_JSON_ONLY_FAILURES: '1', PLAYWRIGHT_JUNIT_ONLY_FAILURES: '1', PLAYWRIGHT_HTML_ONLY_FAILURES: '1' } })) {
  const out = join(dir, 'out', mode);
  const r = pw(['test', '--output', join(out, 'test-results')], { OUT: out, ...env });
  result.modes[mode] = { exit: r.status, json: jsonTitles(join(out, 'report.json')), junit: junit(join(out, 'report.xml')), html: await htmlTitles(join(out, 'html', 'index.html')) };
}
await browser.close();

// Blob reports hold every test; the filter is applied by the reporter that merge-reports runs.
const blobOut = join(dir, 'out', 'blob');
for (const shard of [1, 2]) pw(['test', `--shard=${shard}/2`, '--output', join(blobOut, 'test-results')], { OUT: blobOut, REPORTERS: 'blob', PWTEST_BLOB_DO_NOT_REMOVE: '1' });
const blobs = readdirSync(join(blobOut, 'blob'));
const merge = pw(['merge-reports', '--config', 'merge.config.ts', join(blobOut, 'blob')], { OUT: blobOut });
const mergeFull = pw(['merge-reports', '--reporter', 'json', join(blobOut, 'blob')], { PLAYWRIGHT_JSON_OUTPUT_NAME: join(blobOut, 'merged-full.json') });
result.merge = {
  blobFiles: blobs.length,
  onlyFailures: { exit: merge.status, ...jsonTitles(join(blobOut, 'merged.json')) },
  full: { exit: mergeFull.status, ...jsonTitles(join(blobOut, 'merged-full.json')) },
};

// playwright-shard-balancer builds its timings from the durations in a JSON report.
const timings = (name, report) => {
  const file = join(dir, 'out', `timings-${name}.json`);
  rmSync(file, { force: true });
  const r = spawnSync('npx', ['playwright-shard-balancer', 'update', '--timings', file, report], { cwd: work, encoding: 'utf8' });
  return { exit: r.status, testsWithTimings: Number(r.stdout.match(/"tests": (\d+)/)?.[1] ?? NaN) };
};
result.balancer = { full: timings('full', join(dir, 'out', 'full', 'report.json')), onlyFailures: timings('only', join(dir, 'out', 'onlyFailures', 'report.json')) };
// The same check on the 2,000-test reports of the matrix, at 20 failed tests.
const big = (arm) => join(work, 'out', `${arm}-1`, 'report.json');
if (existsSync(big('json'))) result.balancer2000 = { failed: 20, full: timings('big-full', big('json')), onlyFailures: timings('big-only', big('json-only')) };

mkdirSync(join(root, 'results'), { recursive: true });
writeFileSync(join(root, 'results', 'semantics.json'), JSON.stringify(result, null, 1));
console.log(JSON.stringify(result, null, 1));
