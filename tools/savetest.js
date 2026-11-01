#!/usr/bin/env node
// Old-save test: plays an OLDER build of the game (e.g. `git show <rev>:index.html > old.html`) up to a
// given month, then opens the current index.html with that save, clicks "Continue", checks there are no
// errors, that events added since the old build whose date has passed get backfilled, and plays on.
// Usage: node tools/savetest.js old.html [--lang zh|en|pt] [--until 2029-10] [--weeks 40] [--w 1280 --h 800]
const path = require('path');
const { chromium } = require('playwright');
const { BOT_SRC } = require('./playtest.js');
const A = process.argv.slice(2), arg = (k, d) => { const i = A.indexOf('--' + k); return i >= 0 ? A[i + 1] : d; };
const oldFile = path.resolve(A[0]), newFile = path.resolve(arg('file', path.join(__dirname, '..', 'index.html')));
const lang = arg('lang', 'zh'), until = arg('until', '2029-10'), weeks = Number(arg('weeks', 40)), endless = A.includes('--endless');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: Number(arg('w', 1280)), height: Number(arg('h', 800)) } });
  const errors = []; let stage = 'old';
  page.on('pageerror', e => errors.push(stage + ' pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(stage + ' console: ' + m.text()); });
  const open = async f => { await page.goto('file://' + f + '#lang=' + lang); await page.reload(); };
  await open(oldFile); await page.evaluate(() => localStorage.clear()); await open(oldFile);
  await page.click('[data-i="s1"]'); await page.click('[data-i="s2"]'); await page.click('[data-i="start"]');
  await page.evaluate(`(${BOT_SRC.toString()})()`); await page.evaluate(() => BOT.seed(7));
  const target = (([y, m]) => (y - 2020) * 12 + m - 1)(until.split('-').map(Number));
  while (await page.evaluate(t => { for (let i = 0; i < 8 && S.turn < t && S.phase !== 'end'; i++) BOT.week(); return S.turn < t && S.phase !== 'end'; }, target)) { }
  await page.evaluate(() => save());
  if (endless) await page.evaluate(() => { if (S.phase === 'end') { S.ended = S.ended || ending(); } save(); });
  const before = await page.evaluate(() => ({ t: ds(), wk: S.wk, phase: S.phase, cv: S.cv, seen: Object.keys(S.seen).length }));
  stage = 'new'; await open(newFile);
  const hasContinue = await page.$('[data-i="continue"]');
  if (!hasContinue) errors.push('new: no Continue button for the old save');
  else await page.click('[data-i="continue"]');
  if (endless) { await page.click('[data-e="endless"]'); }
  const after = await page.evaluate(() => ({ t: ds(), wk: S.wk, phase: S.phase, cv: S.cv, queue: S.queue.map(q => q.id + '@' + ds(q.at)) }));
  await page.evaluate(`(${BOT_SRC.toString()})()`); await page.evaluate(() => BOT.seed(8));
  for (let k = 0; k < weeks; k += 4) { const go = await page.evaluate(() => { for (let i = 0; i < 4; i++) if (BOT.week() === false) return false; return true; }); if (!go) break; }
  const fin = await page.evaluate(() => ({ t: ds(), phase: S.phase, events: BOT.events, ended: S.ended }));
  await browser.close();
  console.log(`old save @${before.t} wk${before.wk} (${before.phase}, cv=${before.cv}) -> loaded in new build: ${after.t} cv=${after.cv}`);
  console.log('  queued after load:', after.queue.join(', ') || '(none)');
  console.log('  played on to', fin.t, fin.phase, fin.ended || '', '| events seen:', Object.keys(fin.events).join(', '));
  console.log(errors.length ? errors.slice(0, 10).join('\n') : '  no console errors');
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
