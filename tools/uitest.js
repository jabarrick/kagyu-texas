#!/usr/bin/env node
// UI smoke test: for each language and each viewport (desktop 1280x800, phone 390x844) start a game from
// the title screen, play a few weeks by clicking the real buttons, visit every tab and overlay, render a set
// of event cards (including the newest ones) and the ending screen, then "Keep going" into endless mode.
// Fails on any console error / page error, or if a page scrolls sideways.
// Usage: node tools/uitest.js [--langs zh,en,pt] [--events id1,id2] [--shots /tmp/shots]
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const A = process.argv.slice(2), arg = (k, d) => { const i = A.indexOf('--' + k); return i >= 0 ? A[i + 1] : d; };
const file = path.resolve(arg('file', path.join(__dirname, '..', 'index.html')));
const langs = arg('langs', 'zh,en,pt').split(','), shots = arg('shots', null);
const EVENTS = arg('events', 'tre_flea,designate,final,el_after,el_mila_out,el_rosa,el_windmill,el_three_year,el_citizen,el_hunan_voice,el_heat,ethan_wedding,nyungne,tx_250').split(',');
const VPS = [[1280, 800], [390, 844]];
(async () => {
  const browser = await chromium.launch(); let fails = 0;
  if (shots) fs.mkdirSync(shots, { recursive: true });
  for (const lang of langs) for (const [w, h] of VPS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } }); const page = await ctx.newPage();
    const errs = [], tag = `${lang} ${w}x${h}`;
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    const url = 'file://' + file + '#lang=' + lang;
    await page.goto(url); await page.evaluate(() => localStorage.clear()); await page.reload();
    const overflow = async where => { const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); if (o > 2) errs.push(`horizontal overflow ${o}px on ${where}`); };
    const shot = async n => { if (shots) await page.screenshot({ path: path.join(shots, `${lang}-${w}-${n}.png`) }); };
    await overflow('title'); await shot('0title');
    await page.click('[data-i="s1"]'); await page.click('[data-o="tibetan"]'); await page.click('[data-i="s2"]'); await page.click('[data-s="drukpa"]'); await page.click('[data-i="start"]');
    // play ~10 weeks with real clicks
    const vis = async sel => { const els = await page.$$(sel); for (const e of els) if (await e.isVisible() && await e.isEnabled()) return e; return null; };
    for (let step = 0, weeks = 0; step < 200 && weeks < 10; step++) {
      if (await page.$('#ov .ov')) { const x = await vis('#ov [data-x]') || await vis('#ov .go button:last-child'); if (x) await x.click(); else await page.evaluate(() => { ovEl.innerHTML = ''; ovEl.onclick = null; }); continue; }
      const ph = await page.evaluate(() => S.phase);
      if (ph === 'plan') {
        let a = await vis('[data-a="act"]');
        if (!a) { const t = await vis('[data-a="tab"][data-v="week"]'); if (t) await t.click(); a = await vis('[data-a="act"]'); }
        const acts = await page.$$('[data-a="act"]'); let n = 0; for (const b of acts) { if (n >= 2) break; if (await b.isVisible() && await b.isEnabled()) { await b.click(); n++; } }
        const s = await vis('[data-a="start"]'); if (!s) { errs.push('no start button'); break; } await s.click(); continue;
      }
      if (ph === 'event') { const c = await vis('[data-a="cont"]'); if (c) { await c.click(); continue; } const o = await vis('[data-a="opt"]'); if (o) { await o.click(); continue; } const t = await vis('[data-a="tab"][data-v="week"]'); if (t) { await t.click(); continue; } errs.push('event without buttons'); break; }
      if (ph === 'report') { await shot('1report'); const nx = await vis('[data-a="next"]'); if (!nx) { const t = await vis('[data-a="tab"][data-v="week"]'); if (t) { await t.click(); continue; } errs.push('no next button'); break; } await nx.click(); weeks++; continue; }
      if (ph === 'year') { const b = await vis('[data-a="boon"]'); if (b) { await b.click(); continue; } }
      if (ph === 'silent') { await page.evaluate(() => silentDone()); continue; }
      await page.evaluate(() => { UI.tab = 'week'; render(); });
    }
    await overflow('week'); await shot('2week');
    // every tab
    const tabs = await page.evaluate(() => TABS.map(t => t[0]));
    for (const t of tabs) { await page.evaluate(v => { UI.tab = v; render(); }, t); await overflow('tab ' + t); }
    await page.evaluate(() => { UI.tab = 'map'; render(); }); await shot('3map');
    // overlays
    for (const fn of ['openBuild', 'openWiki', 'openHelp', 'openMenu', 'openPhoto']) { await page.evaluate(f => { if (typeof window[f] === 'function') window[f](); }, fn); await overflow(fn); await page.evaluate(() => { ovEl.innerHTML = ''; ovEl.onclick = null; UI.ovRe = null; }); }
    // event cards, including the newest; set up flags so each variant renders
    for (const id of EVENTS) {
      const variants = id === 'el_after' ? [{ final: 'mila' }, { final: 'succ', heir: 'rosa' }, { final: 'merge' }, { ended: 'exile' }, { ended: 'brand' }, { ended: 'diss' }, {}] : [{}];
      for (const v of variants) {
        await page.evaluate(([id, v]) => { S.phase = 'plan'; S.cur = null; S.res = null; S.pending = []; delete S.seen[id];
          if (id === 'designate') { S.RT = 20; } if (id === 'final') { S.f.designated = 'tenzin'; S.f.rinpocheGone = S.turn; }
          if (id === 'tre_flea') { S.D = Math.max(S.D, 2000); }
          S.f.final = v.final || null; S.f.heir = v.heir || null; S.ended = v.ended || null; dbgTrigger(id, true); }, [id, v]);
        const ph = await page.evaluate(() => S.phase);
        if (ph !== 'event') { errs.push(`event ${id} did not open (${JSON.stringify(v)})`); continue; }
        await overflow('event ' + id); if (id === 'el_after' && v.final === 'mila') await shot('4el_after');
        await page.evaluate(() => { const os = getOpts(EV[S.cur.id]); const k = os.findIndex(o => !o.req || o.req()); choose(Math.max(0, k)); });
        await overflow('result ' + id);
        await page.evaluate(() => { S._ret = 'plan'; cont(); });
      }
    }
    // ending screen and every tab on it, then keep going
    await page.evaluate(() => { S.queue = []; S.f.final = null; S.f.heir = null; S.ended = null; S.turn = 119; S.wk = 3; S.phase = 'report'; S.report = { inc: 0, other: 0, et: 0, net: 0, visitors: 0, attend: 0, lines: [], notes: [], acts: [], monthEnd: true }; nextMonth(); });
    if (await page.evaluate(() => S.phase) !== 'end') errs.push('ending did not open');
    await overflow('ending'); await shot('5ending');
    for (const k of ['d', 'p', 'a', 'e']) { await page.evaluate(k => { UI.sub.end = k; renderEnd(); }, k); await overflow('ending tab ' + k); }
    // reload: the ended save must be continuable
    await page.reload(); if (!await page.$('[data-i="continue"]')) errs.push('no Continue for ended save'); else await page.click('[data-i="continue"]');
    await page.click('[data-e="endless"]');
    for (let i = 0; i < 30 && await page.evaluate(() => S.phase !== 'event'); i++) await page.evaluate(() => { if (S.phase === 'plan') startMonth(); else if (S.phase === 'report') nextMonth(); else if (S.phase === 'year') chooseBoon(S.yr.offer[0]); });
    const cur = await page.evaluate(() => S.cur && S.cur.id);
    if (cur !== 'el_after') errs.push('endless did not open el_after (got ' + cur + ')');
    await overflow('endless event'); await shot('6endless');
    console.log(`${errs.length ? 'FAIL' : 'ok  '} ${tag}${errs.length ? '\n   ' + [...new Set(errs)].slice(0, 12).join('\n   ') : ''}`);
    if (errs.length) fails++;
    await ctx.close();
  }
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
