// Layout audit: at every window size and state, no two overlay elements may overlap and none may leave the screen.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const SP = __dirname;
const server = http.createServer((req, res) => { fs.readFile('/home/user/Trash/index.html', (e, d) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); }); });
const SIZES = [
  { name: 'laptop-1440x900', w: 1440, h: 900 },
  { name: 'desktop-1280x720', w: 1280, h: 720 },
  { name: 'small-1024x600', w: 1024, h: 600 },
  { name: 'phone-landscape-844x390', w: 844, h: 390 },
  { name: 'phone-landscape-small-740x360', w: 740, h: 360 },
  { name: 'phone-portrait-390x844', w: 390, h: 844 },
];
const collect = () => {
  const out = [];
  const push = (el, label) => {
    if (!el) return; const r = el.getBoundingClientRect(); const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || r.width < 1 || r.height < 1) return;
    out.push({ label, x: +r.left.toFixed(1), y: +r.top.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) });
  };
  document.querySelectorAll('#slotScore .chip').forEach((el, i) => push(el, `chip${i}:${el.querySelector('.k').textContent}`));
  document.querySelectorAll('.stageui .grp.right .btn').forEach((el) => push(el, `btn:${el.textContent.trim()}`));
  const hint = document.getElementById('hint'); if (!hint.hidden) push(hint, 'hint');
  push(document.getElementById('rotate'), 'rotate');
  push(document.getElementById('feedback'), 'feedback');
  return out;
};
const overlaps = (a, b) => {
  const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return ix > 1 && iy > 1 ? { ix: +ix.toFixed(1), iy: +iy.toFixed(1) } : null;
};
(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); const url = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${SP}/ball3.y4m`, '--autoplay-policy=no-user-gesture-required'] });
  let fails = 0;
  for (const sz of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: sz.w, height: sz.h }, permissions: ['camera'] });
    const page = await ctx.newPage(); await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    page.on('pageerror', (e) => { console.log(`  PAGE ERROR ${sz.name}: ${e.message}`); fails++; });
    await page.goto(url); await page.waitForTimeout(700);
    // normal page must not scroll sideways
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (sideways > 1) { console.log(`  FAIL ${sz.name}: normal page scrolls sideways by ${sideways}px`); fails++; }
    await page.click('#btnStart'); await page.waitForTimeout(2200);
    for (const state of ['idle', 'hint', 'drawer']) {
      if (state === 'hint') await page.evaluate(() => document.getElementById('btnCorners').click());
      if (state === 'drawer') { await page.evaluate(() => document.getElementById('hintCancel').click()); await page.evaluate(() => document.getElementById('hudSettings').click()); }
      await page.waitForTimeout(350);
      const boxes = await page.evaluate(collect);
      const vp = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
      // the audit is only meaningful if the things it measures are actually on screen
      const want = { chips: 5, buttons: 4, feedback: 1, hint: state === 'hint' ? 1 : 0 };
      const got = { chips: boxes.filter((b) => b.label.startsWith('chip')).length, buttons: boxes.filter((b) => b.label.startsWith('btn:')).length, feedback: boxes.filter((b) => b.label === 'feedback').length, hint: boxes.filter((b) => b.label === 'hint').length };
      for (const k of Object.keys(want)) if (got[k] !== want[k]) { console.log(`  FAIL ${sz.name}/${state}: expected ${want[k]} ${k} visible, saw ${got[k]}`); fails++; }
      const header = await page.evaluate(() => getComputedStyle(document.querySelector('header.top')).display);
      if (header !== 'none') { console.log(`  FAIL ${sz.name}/${state}: page header still visible in stage mode`); fails++; }
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const o = overlaps(boxes[i], boxes[j]);
        if (o) { console.log(`  FAIL ${sz.name}/${state}: "${boxes[i].label}" overlaps "${boxes[j].label}" by ${o.ix}x${o.iy}px`); fails++; }
      }
      for (const b of boxes) if (b.x < -1 || b.y < -1 || b.x + b.w > vp.w + 1 || b.y + b.h > vp.h + 1) { console.log(`  FAIL ${sz.name}/${state}: "${b.label}" off screen (${b.x},${b.y} ${b.w}x${b.h} in ${vp.w}x${vp.h})`); fails++; }
      if (state === 'drawer') {
        const d = await page.evaluate(() => { const r = document.getElementById('rail').getBoundingClientRect(), sc = document.getElementById('scrim'); return { open: document.getElementById('rail').classList.contains('open'), right: Math.round(r.right), left: Math.round(r.left), w: Math.round(r.width), scrim: sc.classList.contains('on'), settingsVisible: [...document.querySelectorAll('#rail details.group')].length }; });
        if (!d.open || !d.scrim || d.right > vp.w + 1 || d.left < -1) { console.log(`  FAIL ${sz.name}: drawer ${JSON.stringify(d)}`); fails++; }
        await page.screenshot({ path: `${SP}/ui-${sz.name}-drawer.png` });
        await page.evaluate(() => document.getElementById('drawerClose').click()); await page.waitForTimeout(300);
      }
      if (state === 'hint') await page.screenshot({ path: `${SP}/ui-${sz.name}-hint.png` });
      if (state === 'idle') await page.screenshot({ path: `${SP}/ui-${sz.name}.png` });
    }
    const fit = await page.evaluate(() => { const r = document.getElementById('view').getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2) }; });
    const bar = await page.evaluate(() => { const r = document.querySelector('.srow-top').getBoundingClientRect(); return { h: Math.round(r.height), frac: r.height / window.innerHeight }; });
    if (bar.frac > 0.3) { console.log(`  FAIL ${sz.name}: top bar takes ${Math.round(bar.frac * 100)}% of the height (${bar.h}px)`); fails++; }
    const rot = await page.evaluate(() => getComputedStyle(document.getElementById('rotate')).display !== 'none');
    const wantRot = sz.h > sz.w && sz.w < 900;
    if (rot !== wantRot) { console.log(`  FAIL ${sz.name}: rotate prompt ${rot ? 'shown' : 'hidden'}, expected ${wantRot ? 'shown' : 'hidden'}`); fails++; }
    const offX = Math.abs(fit.cx - sz.w / 2), offY = Math.abs(fit.cy - sz.h / 2);
    if (offX > 2 || offY > 2) { console.log(`  FAIL ${sz.name}: canvas off centre by ${offX},${offY}px`); fails++; }
    if (fit.w > sz.w + 1 || fit.h > sz.h + 1) { console.log(`  FAIL ${sz.name}: canvas ${fit.w}x${fit.h} larger than the window`); fails++; }
    console.log(`  ${sz.name}: canvas ${fit.w}x${fit.h} centred at ${fit.cx},${fit.cy} (window centre ${sz.w / 2},${sz.h / 2})`);
    await ctx.close();
  }
  console.log(fails === 0 ? 'LAYOUT AUDIT PASSED: no overlaps, nothing off screen' : `LAYOUT AUDIT FAILED: ${fails} problem(s)`);
  await browser.close(); server.close(); process.exit(fails === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
