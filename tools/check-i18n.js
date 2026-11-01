#!/usr/bin/env node
// Translation completeness check for index.html (zh / en / pt).
// Each language is a full copy of the game script (<script id="kw-xx">). This tokenizes all three
// with the TypeScript parser and checks that they line up string for string.
// Usage: node tools/check-i18n.js [path/to/index.html]   (needs the `typescript` package)
const fs = require('fs'), path = require('path');
let ts;
for (const p of ['typescript', '/opt/npm-tools/node_modules/typescript']) { try { ts = require(p); break; } catch (e) {} }
if (!ts) { console.error('typescript package not found (npm i -g typescript)'); process.exit(2); }
const file = process.argv[2] || path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(file, 'utf8');
const CJK = /[\u3400-\u9fff\u3000-\u303f\uff00-\uffef\uf900-\ufaff]/;
const HAN = /[\u3400-\u9fff\uf900-\ufaff]/; // real Chinese text, not just CJK punctuation or spaces
function extract(l) {
  const tag = `<script id="kw-${l}" type="text/x-kagyu">`;
  const a = html.indexOf(tag); if (a < 0) throw new Error('missing ' + tag);
  const b = html.indexOf('</script>', a);
  const src = html.slice(a + tag.length, b);
  const sf = ts.createSourceFile(l + '.js', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const strs = [], events = {};
  (function walk(n) {
    const line = () => sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) strs.push({ t: n.text, line: line(), whole: true });
    else if (ts.isTemplateExpression(n)) { strs.push({ t: n.head.text, line: line(), whole: false }); n.templateSpans.forEach(s => strs.push({ t: s.literal.text, line: line(), whole: false })); }
    if (ts.isCallExpression(n) && n.expression.getText(sf) === 'E' && n.arguments[0] && ts.isObjectLiteralExpression(n.arguments[0])) {
      const o = {}; n.arguments[0].properties.forEach(p => { if (p.name && p.initializer) o[p.name.getText(sf)] = p.initializer; });
      if (o.id) events[o.id.text] = o.title ? (o.title.text || '') : null;
    }
    ts.forEachChild(n, walk);
  })(sf);
  return { strs, events, parseErrors: sf.parseDiagnostics.length };
}
const L = { zh: extract('zh'), en: extract('en'), pt: extract('pt') };
let fail = 0; const out = [];
const bad = (m) => { fail++; out.push('FAIL ' + m); };
for (const l of ['zh', 'en', 'pt']) if (L[l].parseErrors) bad(`${l}: ${L[l].parseErrors} parse errors`);
const n = L.zh.strs.length;
for (const l of ['en', 'pt']) if (L[l].strs.length !== n) bad(`${l}: ${L[l].strs.length} string literals vs zh ${n} (scripts out of sync)`);
for (const l of ['en', 'pt']) {
  const cjk = L[l].strs.filter(s => CJK.test(s.t));
  cjk.slice(0, 10).forEach(s => bad(`${l}:${s.line} untranslated CJK: ${JSON.stringify(s.t.slice(0, 60))}`));
  if (cjk.length > 10) bad(`${l}: ...${cjk.length - 10} more CJK strings`);
  if (L[l].strs.length === n) L.zh.strs.forEach((z, i) => {
    const s = L[l].strs[i];
    if (z.whole && HAN.test(z.t) && !s.t.trim()) bad(`${l}:${s.line} empty translation of ${JSON.stringify(z.t.slice(0, 40))}`);
    if (z.whole && HAN.test(z.t) && s.t === z.t) bad(`${l}:${s.line} identical to Chinese`);
  });
  const ze = Object.keys(L.zh.events), le = Object.keys(L[l].events);
  ze.filter(id => !(id in L[l].events)).forEach(id => bad(`${l}: event ${id} missing`));
  le.filter(id => !(id in L.zh.events)).forEach(id => bad(`${l}: extra event ${id}`));
  le.filter(id => L[l].events[id] === '').forEach(id => bad(`${l}: event ${id} has an empty title`));
}
const ne = Object.keys(L.zh.events).length;
if (out.length) console.log(out.join('\n'));
console.log(`i18n check: ${n} string literals per language, ${ne} event cards; zh/en/pt aligned; ` +
  `${L.en.strs.filter(s => CJK.test(s.t)).length} CJK strings in en, ${L.pt.strs.filter(s => CJK.test(s.t)).length} in pt -> ${fail ? 'FAIL (' + fail + ')' : 'PASS'}`);
process.exit(fail ? 1 : 0);
