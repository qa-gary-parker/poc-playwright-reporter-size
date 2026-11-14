// Measures how long each report from the last matrix repeat takes to load. Needs work/out from run-matrix.mjs.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const root = resolve(import.meta.dirname, '..');
const out = join(root, 'work', 'out');
const { chromium } = createRequire(join(root, 'work', 'package.json'))('@playwright/test');
const FAIL_PCT = [0, 1, 5, 20];
const LOADS = 10;
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

const rows = [];
for (const failPct of FAIL_PCT) for (const arm of ['json', 'json-only']) {
  const file = join(out, `${arm}-${failPct}`, 'report.json');
  const ms = [];
  for (let i = 0; i < LOADS; i++) {
    const start = performance.now();
    JSON.parse(readFileSync(file, 'utf8'));
    ms.push(performance.now() - start);
  }
  rows.push({ failPct, arm, metric: 'read + JSON.parse', loads: LOADS, medianMs: +median(ms).toFixed(1), minMs: +Math.min(...ms).toFixed(1), maxMs: +Math.max(...ms).toFixed(1) });
}

// Case 0000 fails at every failure rate above 0, so every report lists it. At 0 failures the onlyFailures report has no test to wait for.
const MARKER = 'case 0000 checks the order total';
const pages = { html: 'html/index.html', 'html-only': 'html/index.html' };
const browser = await chromium.launch();
for (const failPct of FAIL_PCT) for (const [arm, rel] of Object.entries(pages)) {
  const file = join(out, `${arm}-${failPct}`, rel);
  if (!existsSync(file)) throw new Error(`missing ${file}`);
  if (failPct === 0 && arm === 'html-only') continue;
  const ms = [];
  let nodes = 0;
  for (let i = 0; i < LOADS; i++) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const start = performance.now();
    await page.goto(`file://${file}`, { waitUntil: 'commit' });
    await page.waitForFunction((m) => document.body?.innerText.includes(m), MARKER, { timeout: 60000, polling: 'raf' });
    ms.push(performance.now() - start);
    nodes = await page.evaluate(() => document.querySelectorAll('*').length);
    await context.close();
  }
  rows.push({ failPct, arm, metric: 'navigation to first test title visible in text', loads: LOADS, medianMs: +median(ms).toFixed(1), minMs: +Math.min(...ms).toFixed(1), maxMs: +Math.max(...ms).toFixed(1), domNodes: nodes });
}
await browser.close();

writeFileSync(join(root, 'results', 'load.json'), JSON.stringify(rows, null, 1));
const md = ['| failed tests | arm | metric | median ms | min-max ms | DOM nodes |', '|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${2000 * r.failPct / 100} | ${r.arm} | ${r.metric} | ${r.medianMs} | ${r.minMs}-${r.maxMs} | ${r.domNodes ?? ''} |`)].join('\n');
writeFileSync(join(root, 'results', 'load.md'), md + '\n');
console.log(md);
