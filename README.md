# 噶举·韦科 · KAGYU, TEXAS

A narrative management sim: run a Kagyu Buddhist dharma center on a farm by Lake Waco, Texas, 2020–2029 — and beyond.

**Play:** open `index.html` in any browser, or visit the GitHub Pages link for this repo. Everything is in one file; no server, no install. Progress saves in your browser.

- 中文 / English / Português (pt-PT) — switch on the title screen, in the menu, or under 状态 → 设置. Each language keeps its own save. Direct links: `#lang=zh`, `#lang=en`, `#lang=pt`.
- Works on desktop (two-pane layout) and phones (paged layout).
- Fictional story, including a fictional alternate history from 2027 on. Not a prediction.

Translation check (all three language scripts must line up string for string, no Chinese left in en/pt): `node tools/check-i18n.js` (needs the `typescript` npm package).

Playtesting tools (need Playwright):

- `node tools/playtest.js --lang zh --origin asian --style balanced --seed 1` plays 2020 to the ending like a player who builds, spends, opens ventures and answers every card; prints the monthly economy, where Lineage/Trust come from, stuck points and the ending. `--style idle` is a player who never builds; `--diff hard`, `--final mila`, `--endless 24` and `--json out.json` are also available.
- `node tools/uitest.js` clicks through the game in all three languages at 1280×800 and 390×844, renders the newest event cards and the ending, and fails on any console error or sideways scrolling.
- `node tools/savetest.js old.html --lang en --until 2029-10` plays an older build (`git show <rev>:index.html > old.html`) to a date, loads that save in the current build and checks that missed new events are backfilled.

When adding a dated event (`at:'YYYY-MM'`), also add its id to `CV_EV` under the current content version `CV` so old saves past that date get it.

Font: [Fusion Pixel](https://github.com/TakWolf/fusion-pixel-font) (SIL OFL), subset and embedded.
