#!/usr/bin/env node
// Playtest bot: plays index.html from March 2020 to the ten-year ending (and optionally into endless mode)
// like a real player would — it picks weekly actions, builds rooms and venues, buys land and treasures,
// opens ventures, studies the tech tree and answers every event card. It logs the monthly economy and
// flags "stuck" stretches (debt, nothing affordable, burnout spirals) so balance changes can be checked.
//
// Usage: node tools/playtest.js [--lang zh|en|pt] [--origin asian|convert|tibetan|monk|black|hispanic]
//          [--school karma|drukpa|drikung] [--style balanced|lineage|builder|frugal|idle|casual] [--seed N]
//          [--diff easy|normal|hard|zen] [--final remote|local|merge|succ|mila] [--endless 24] [--json out.json] [--quiet]
// Needs Playwright (require('playwright')). Exit code 1 if the page logs an error.
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const A = process.argv.slice(2), arg = (k, d) => { const i = A.indexOf('--' + k); return i >= 0 ? A[i + 1] : d; };
const opt = {
  lang: arg('lang', 'zh'), origin: arg('origin', 'asian'), school: arg('school', 'karma'), style: arg('style', 'balanced'),
  seed: Number(arg('seed', 1)), diff: arg('diff', 'normal'), final: arg('final', null), endless: Number(arg('endless', 0)), json: arg('json', null), quiet: A.includes('--quiet'),
  file: arg('file', path.join(__dirname, '..', 'index.html')), w: Number(arg('w', 1280)), h: Number(arg('h', 800)),
};

// Runs inside the page. Uses the game's own functions — the same ones the buttons call.
function BOT_SRC() {
  let seed = 1;
  const R = () => (seed = seed * 16807 % 2147483647) / 2147483647;
  const BOT = window.BOT = { months: [], buys: [], stuck: [], events: {}, evYear: {}, style: 'balanced' };
  BOT.seed = s => { seed = s || 1; Math.random = R; };
  // where do Lineage / Trust / Dana come from? (per year: events, actions, weekly settle)
  BOT.contrib = {};
  const track = (name, key) => { const f = window[name]; window[name] = function () { const b = { L: S.L, T: S.T, D: S.D }; const r = f.apply(this, arguments); const y = Y(); const c = BOT.contrib[y] = BOT.contrib[y] || {}; const k = c[key] = c[key] || { L: 0, T: 0, D: 0 }; k.L += S.L - b.L; k.T += S.T - b.T; k.D += S.D - b.D; k.HP = (k.HP || 0) + S.HP - b.HP; return r; }; };
  { const f = window.soft; window.soft = function (fn) { const b = { L: S.L, T: S.T, D: S.D, HP: S.HP }; const r = f.apply(this, arguments); const key = fn === runActs ? 'act' : fn === settle0 ? 'week' : 'ev'; const y = Y(); const c = BOT.contrib[y] = BOT.contrib[y] || {}; const k = c[key] = c[key] || { L: 0, T: 0, D: 0 }; k.L += S.L - b.L; k.T += S.T - b.T; k.D += S.D - b.D; k.HP = (k.HP || 0) + S.HP - b.HP; return r; }; }
  track('spend', 'spend');
  const pickR = a => a.length ? a[Math.floor(R() * a.length)] : null;
  const reserve = () => Math.max(1200, expTotal() * (BOT.style === 'frugal' ? 5 : 3));
  const spendable = () => S.D - reserve();
  const buy = (what, c, fn) => { if (c > spendable()) return false; const d0 = S.D; const ok = fn(); if (ok !== false && S.D !== d0) { BOT.buys.push({ t: ds(), wk: S.wk, what, cost: Math.round(d0 - S.D) }); return true; } return false; };
  const roomsN = t => (S.bld || []).reduce((a, b) => a + b.rooms.filter(r => r.t === t).length, 0);
  const itemsN = t => S.layout.items.filter(i => i.t === t).length + S.layout.tray.filter(i => i.t === t).length;
  const roomCost = t => { const m = RT[t].min; const w = m[0] + (t === 'shrine' ? 2 : 0), h = m[1] + (t === 'shrine' ? 1 : 0); return cost_(w * h * RT[t].cost + w * (h + 1) * SHELL); };
  const ROOM_ORDER = ['kitchen', 'office', 'bedroom', 'tea', 'restroom', 'studio', 'storage', 'library', 'genkan', 'kids', 'translate', 'shedra', 'counsel', 'dining', 'mandala', 'meeting', 'retreat', 'guest', 'ritual', 'columbarium', 'thangka', 'interfaith', 'protector', 'dorm', 'vets', 'restroom'];
  const ITEM_ORDER = [['parking', 2], ['coop', 2], ['beehive', 4], ['lamp', 2], ['gate', 1], ['sign', 1], ['tank', 2], ['picnic', 3], ['campsite', 2], ['flag', 6], ['firepit', 1], ['stall', 2], ['solar', 1], ['pavilion', 2], ['maniwall', 2], ['playground', 1], ['greenhouse', 1], ['foodtruck', 1], ['bigwheel', 1], ['parking', 4], ['guru', 1], ['bell', 1], ['chorten', 1], ['stage', 1], ['solar', 2], ['shelter', 1]];
  window.spend = function spend() {
    const notes = [];
    // 1. capacity: when the shrine room is the bottleneck, build a bigger hall
    const cap = capacity(), n = act().length;
    if (S.loc !== 'home' && n >= cap - 3) {
      const sizes = [[8, 6], [10, 7], [12, 8], [14, 10], [16, 12]];
      const cur = mainShrine(); const curA = cur ? cur.w * cur.h : 0;
      for (const [w, h] of sizes) { if (w * h <= curA) continue; const c = cost_(w * h * (SHELL + RT.shrine.cost)); if (buy(`shrine hall ${w}x${h}`, c, () => autoBuildHall(w, h))) break; else { notes.push(`want hall ${w}x${h} $${c}`); break; } }
    }
    // 2. covid: stream room
    if (covid() && !S.fac.zoom && S.bld) buy('studio', roomCost('studio'), () => autoRoom('studio'));
    // 3. rooms, one of each, in priority order
    if (S.bld) {
      let k = 0;
      for (const t of ROOM_ORDER) {
        if (roomsN(t) >= (t === 'restroom' ? 2 : 1)) continue; if (!okc(RT[t])) continue; if (BOT.style === 'frugal' && k > 0) break;
        const c = roomCost(t); if (buy('room ' + t, c, () => autoRoom(t))) { k++; if (k >= 2) break; } else { notes.push(`want room ${t} $${c}`); break; }
      }
    }
    // 4. venues/objects
    if (S.layout) for (const [t, max] of ITEM_ORDER) {
      if (itemsN(t) >= max) continue; const d = IT[t]; if (!d || d.cost == null || !okc(d)) continue;
      if (buy('item ' + t, cost_(d.cost), () => buyDecor(t))) break;
    }
    // 5. special facilities: stupa, prayer wheels
    for (const id of ['garden', 'wheels', 'stupa']) { const f = FAC.find(x => x.id === id); const lv = typeof facLv === 'function' ? facLv(id) : S.fac[id]; if (lv >= (f.max || 1) || !okc(f)) continue; const c = cost_(f.cost(lv)); if (c * 1.5 > spendable()) { notes.push(`want ${id} $${c}`); continue; } buy(id + ' L' + (lv + 1), c, () => build(id)); }
    // 6. ventures + managers
    entInit();
    for (const id in ENT) { const d = ENT[id]; if (S.ent[id] || !d.req()) continue; if (buy('venture ' + id, cost_(d.cost), () => entStart(id))) break; else notes.push(`want venture ${id}`); }
    for (const id of entOpen()) { if (entMgr(id)) continue; const m = act().filter(x => x.c >= 55 && !hasRole(x) && !Object.values(S.ent).some(e => e.mgr === x.id)).sort((a, b) => b.c - a.c)[0]; if (m) entSetMgr(id, m.id); }
    for (const id of Object.keys(S.ent)) { const e = S.ent[id]; if (e.st === 'open' && e.q < 40) buy('renovate ' + id, cost_(Math.round(ENT[id].base * .5)), () => entRepair(id)); }
    // 7. treasures
    for (const id of treShop().sort((a, b) => TRE[a].price - TRE[b].price)) { const d = TRE[id]; if (d.need && !d.need()) continue; if (d.needRoom && !roomsOn(d.needRoom).length) continue; if (cost_(d.price) * 2 > spendable()) break; if (buy('treasure ' + id, cost_(d.price), () => treBuy(id))) break; }
    // 8. land: when rich, or when nothing more fits
    const rich = runway() > 14;
    const parc = PARCELS.filter(p => buyable(p)).sort((a, b) => landPrice(a) - landPrice(b))[0];
    if (parc && (rich || notes.some(x => x.startsWith('want hall'))) && cost_(landPrice(parc)) * 1.3 < spendable()) buy('parcel ' + parc.id, cost_(landPrice(parc)), () => buyParcel(parc.id));
    // 8b. endowment: park the surplus once there is more than 15 months of runway
    if (ch() >= 3 && runway() > 9 && BOT.style !== 'frugal') { const a = S.D - expTotal() * 8 > 20000 ? 20000 : 5000; if (S.D - a > expTotal() * 8) { S.D -= a; S.endow = (S.endow || 0) + a; BOT.buys.push({ t: ds(), wk: S.wk, what: 'endowment', cost: a }); } }
    // 9. tech
    for (const t of TECH) if (techState(t) === 'ready') { techLearn(t.id); BOT.buys.push({ t: ds(), wk: S.wk, what: 'tech ' + t.id, cost: 0 }); }
    // 10. roles
    v8Init();
    for (const k of Object.keys(ROLES)) { if (S.roles[k] && has(S.roles[k])) continue; const m = act().filter(x => x.c >= 55 && !hasRole(x) && !Object.values(S.ent || {}).some(e => e.mgr === x.id)).sort((a, b) => b.c - a.c)[0]; if (m) setRole(k, m.id); }
    return notes;
  }
  // depth slider: move Sunday depth to keep both ropes near the middle
  function setDepth() {
    const am = allowedMax(); let d = S.dil;
    if (S.L < 45) d += 5; else if (S.T < 40) d -= 5; else if (S.L > 65 && S.T < 55) d -= 3;
    if (BOT.style === 'lineage') d += 2;
    S.dil = clamp(Math.round(d), 10, am);
  }
  function pickActs() {
    const n = slotsMax(), A = [], ok = id => { const a = ACTS.find(x => x.id === id); return a && okc(a) && !A.includes(id); }, add = id => { if (A.length < n && ok(id)) A.push(id); };
    const f = id => fatMul ? fatMul(id) : 1;
    if (S.B >= 62) add('rest');
    if (S.HP < 45) add('exercise');
    const poor = runway() < 3 || S.D < 1500;
    if (poor) { if (f('fund') > .6) add('fund'); add('camp'); if (f('live') > .6) add('live'); add('farm'); }
    if (FEST[Mo()] && S.f.festAt !== S.turn && S.D > 1500) add('fest');
    if (S.self < 40 || S.RT < 45) add('self');
    if (S.L < 45) { add('group'); add('retreat'); add('tsok'); }
    if (S.T < 40) { add('service'); add('neighbors'); add('clean'); }
    if ((S.HA || 60) < 45) add('tea');
    if (!S.f.c3 && (ch() >= 2 || Y() === 2021)) add('admin');
    if (runway() > 12 && S.D > 8000) add('dana');
    const pool = BOT.style === 'lineage' ? ['group', 'self', 'retreat', 'study', 'tsok', 'translate', 'care', 'tea', 'grant', 'hospice']
      : ['group', 'intro', 'care', 'self', 'grant', 'tea', 'study', 'service', 'retreat', 'faith', 'translate', 'fund', 'prison', 'school', 'hospice', 'train'];
    const shuffled = pool.map(x => [x, R()]).sort((a, b) => a[1] - b[1]).map(x => x[0]);
    if (ch() >= 3 && !S.f.localGuide && !S.f.guide) add('train');
    shuffled.forEach(add);
    return A.slice(0, n);
  }
  function scoreOpt(o) {
    const e = o.e || {}; let s = 0;
    const wL = S.L < 45 ? 1.6 : S.L > 70 ? .4 : 1, wT = S.T < 40 ? 1.6 : S.T > 70 ? .4 : 1;
    s += (e.L || 0) * wL + (e.T || 0) * wT + (e.M || 0) * .5 + (e.HA || 0) * .3 + (e.RT || 0) * .4 + (e.S || 0) * .3 + (e.KN || 0) * .2;
    s -= (e.B || 0) * (S.B > 50 ? .5 : .2); s -= Math.max(0, (e.H || 0) - 5) * .15;
    if (e.D) s += e.D / Math.max(800, Math.abs(S.D) * .5 + 400) * (S.D < 2000 ? 3 : 1.2);
    if (e.gen) s += e.gen * 1.5; if (e.add) s += 3; if (e.rm) s -= 4;
    if (e.c) for (const k in e.c) s += (e.c[k] || 0) * (k === 'all' ? .4 : .15);
    return s + R() * 2.5;
  }
  function answer() {
    const ev = EV[S.cur.id]; S.ctx = S.cur.ctx; const os = getOpts(ev);
    { const y = BOT.evYear[Y()] = BOT.evYear[Y()] || { n: 0, story: 0 }; y.n++; if (ev.at || ev.qonly) y.story++; }
    if (BOT.style === 'casual') { const ok = os.map((o, i) => i).filter(i => !os[i].req || os[i].req()); BOT.events[S.cur.id] = (BOT.events[S.cur.id] || 0) + 1; return choose(ok.length ? ok[Math.floor(R() * ok.length)] : 0); }
    if (BOT.style === 'idle') { const k = os.findIndex(o => !o.req || o.req()); BOT.events[S.cur.id] = (BOT.events[S.cur.id] || 0) + 1; return choose(Math.max(0, k)); }
    let best = -1, bs = -1e9;
    if (S.cur.id === 'final' && BOT.final) { const k = os.findIndex(o => o.e && o.e.f && o.e.f.final === BOT.final && (!o.req || o.req())); if (k >= 0) { BOT.events.final = 1; return choose(k); } }
    os.forEach((o, i) => { if (o.req && !o.req()) return; const sc = scoreOpt(o); if (sc > bs) { bs = sc; best = i; } });
    if (best < 0) best = 0;
    BOT.events[S.cur.id] = (BOT.events[S.cur.id] || 0) + 1;
    choose(best);
  }
  BOT.snapshot = () => ({ t: ds(), D: Math.round(S.D), L: Math.round(S.L), T: Math.round(S.T), H: Math.round(S.H), B: Math.round(S.B), HP: Math.round(S.HP), M: Math.round(S.M), HA: Math.round(S.HA), mem: act().length, left: S.members.filter(x => x.left).length, cap: capacity(), att: S.lastAttend || 0, ent: entOpen().length, bld: (S.bld || []).length, rooms: (S.bld || []).reduce((a, b) => a + b.rooms.length, 0), parcels: (S.parcels || []).length, dil: S.dil, renown: Math.round(S.renown || 0), avgC: Math.round(act().reduce((a, x) => a + x.c, 0) / Math.max(1, act().length)), lb: (() => { const l = layoutEval(), t = S.tre ? treFx() : {}; return { L: +(l.L || 0).toFixed(2), T: +(l.T || 0).toFixed(2), tL: +(t.L || 0).toFixed(2), tT: +(t.T || 0).toFixed(2), commit: +(l.commit || 0).toFixed(2), newP: +(l.newP || 0).toFixed(3) }; })() });
  // one week. returns false when the game reached the ending screen
  BOT.week = () => {
    let guard = 0;
    while (guard++ < 60) {
      if (S.phase === 'end') return false;
      if (S.phase === 'year') { const offer = S.yr.offer; const pref = BOT.style === 'lineage' ? ['retreat', 'study', 'sangha'] : ['sangha', 'outreach', 'thrift', 'build', 'health']; const id = pref.find(p => offer.includes(p)) || offer[0]; chooseBoon(id); continue; }
      if (S.phase === 'plan') {
        if (BOT.style === 'casual') { // impulsive player: random actions, buys whatever catches the eye, never rests on purpose
          if (S.wk === 0 && R() < .35 && S.D > 600) { const t = pickR(Object.keys(IT).filter(k => IT[k].cost != null && IT[k].cost < S.D - 300 && okc(IT[k]))); if (t) buyDecor(t); }
          if (S.wk === 0 && R() < .15 && S.bld) { const t = pickR(Object.keys(RT).filter(k => okc(RT[k]))); if (t) autoRoom(t); }
          if (S.wk === 0 && R() < .1) { entInit(); const id = pickR(Object.keys(ENT).filter(k => !S.ent[k] && ENT[k].req())); if (id) entStart(id); }
          if (R() < .1) S.dil = clamp(S.dil + Math.round((R() - .5) * 30), 0, allowedMax());
          const av = ACTS.filter(a => okc(a)).map(a => a.id); S.acts = []; while (S.acts.length < slotsMax() && av.length) S.acts.push(av.splice(Math.floor(R() * av.length), 1)[0]);
          startMonth(); continue; }
        if (BOT.style === 'idle') { S.acts = ['group', 'intro', 'fund'].slice(0, slotsMax()); startMonth(); continue; }
        if (S.wk === 0) BOT.lastNotes = window.spend();
        setDepth(); S.acts = pickActs(); render(); startMonth(); continue;
      }
      if (S.phase === 'event') { if (!S.res) answer(); else cont(); continue; }
      if (S.phase === 'silent') { silentDone(); continue; }
      if (S.phase === 'report') {
        const r = S.report;
        if (r && r.monthEnd) {
          const snap = BOT.snapshot(); snap.inc = r.inc; snap.other = r.other; snap.exp = r.et; snap.net = Math.round(r.inc * 4 + r.other - r.et); snap.want = (BOT.lastNotes || []).slice(0, 3); snap.lines = r.lines.filter(l => Math.abs(l[1]) >= 150).map(l => l[0].slice(0, 28) + ':' + l[1]);
          BOT.months.push(snap);
          if (S.D < 0) BOT.stuck.push(`${snap.t} in debt ${snap.D}`);
          if (S.B >= 85) BOT.stuck.push(`${snap.t} burnout ${snap.B}`);
        }
        nextMonth(); return S.phase !== 'end';
      }
      throw new Error('unknown phase ' + S.phase);
    }
    throw new Error('stuck in phase ' + S.phase + ' at ' + ds());
  };
}

if (require.main === module) (async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: opt.w, height: opt.h } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const url = 'file://' + path.resolve(opt.file) + '#lang=' + opt.lang;
  await page.goto(url); await page.evaluate(() => localStorage.clear()); await page.goto(url); await page.reload();
  // Start through the real intro screen
  await page.click('[data-i="s1"]'); await page.click(`[data-o="${opt.origin}"]`); await page.click('[data-i="s2"]');
  await page.click(`[data-s="${opt.school}"]`); await page.click('[data-i="start"]');
  await page.evaluate(`(${BOT_SRC.toString()})()`);
  await page.evaluate(([s, st, df, fi]) => { BOT.seed(s); BOT.style = st; S.opt.diff = df; BOT.final = fi; }, [opt.seed, opt.style, opt.diff, opt.final]);
  let alive = true, weeks = 0;
  while (alive && weeks < 2000) { alive = await page.evaluate(() => { let a = true; for (let i = 0; i < 4 && a; i++) a = BOT.week(); return a; }); weeks += 4; }
  const end = await page.evaluate(() => ({ ending: S.ended || ending(), scores: endingScores(), snap: BOT.snapshot(), epi: epilogue(), final: S.f.final, designated: S.f.designated, text: document.querySelector('.ending') ? document.querySelector('.ending').innerText.slice(0, 600) : '' }));
  let endless = null;
  if (opt.endless) {
    await page.click('[data-e="endless"]');
    let n = 0; while (n < opt.endless * 4) { await page.evaluate(() => BOT.week()); n++; }
    endless = await page.evaluate(() => ({ snap: BOT.snapshot(), seen: Object.keys(S.seen).filter(k => /^el_/.test(k)), log: S.log.slice(0, 40).map(l => ds(l.t) + ' ' + l.x) }));
  }
  const data = await page.evaluate(() => ({ evYear: BOT.evYear, contrib: BOT.contrib, months: BOT.months, buys: BOT.buys, stuck: BOT.stuck, events: BOT.events }));
  await browser.close();
  const out = { opt, end, endless, errors, ...data };
  if (opt.json) fs.writeFileSync(opt.json, JSON.stringify(out, null, 1));
  if (!opt.quiet) {
    console.log(`== ${opt.lang} ${opt.origin}/${opt.school} style=${opt.style} seed=${opt.seed}`);
    data.months.filter((m, i) => i % 6 === 0 || i === data.months.length - 1).forEach(m => console.log(`${m.t} D=${m.D} net=${m.net} inc/wk=${m.inc} oth=${m.other} exp=${m.exp} L=${m.L} T=${m.T} B=${m.B} HP=${m.HP} mem=${m.mem}/${m.cap} att=${m.att} ent=${m.ent} rooms=${m.rooms} parc=${m.parcels} ${m.want.join('; ')}`));
    Object.entries(data.contrib).forEach(([y, c]) => console.log(y, Object.entries(c).map(([k, v]) => `${k}: L${v.L >= 0 ? '+' : ''}${v.L.toFixed(0)} T${v.T >= 0 ? '+' : ''}${v.T.toFixed(0)} $${Math.round(v.D)}`).join('  ')));
    console.log('buys:', data.buys.length, 'stuck:', data.stuck.length, data.stuck.slice(0, 8).join(' | '));
  }
  console.log(`ENDING ${end.ending} (final=${end.final}, designated=${end.designated}) D=${end.snap.D} L=${end.snap.L} T=${end.snap.T} mem=${end.snap.mem} errors=${errors.length}`);
  if (endless) console.log('endless ->', JSON.stringify(endless.snap));
  errors.slice(0, 10).forEach(e => console.log('  ' + e));
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

module.exports = { BOT_SRC };
