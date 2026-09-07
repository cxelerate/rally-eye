// End-to-end: drive the app the way a person would and check the results against known truth.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const SP = __dirname, FILE = '/home/user/Trash/index.html';
const server = http.createServer((req, res) => { fs.readFile(FILE, (e, d) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); }); });
let pass = 0, fail = 0;
const ok = (cond, name, detail) => { if (cond) { pass++; console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); } };

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  const truth = JSON.parse(fs.readFileSync(`${SP}/ball3.y4m.truth.json`, 'utf8'));
  const launch = (clip) => chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${SP}/${clip}`, '--autoplay-policy=no-user-gesture-required'] });
  const newPage = async (browser, opts = {}) => {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 720 }, permissions: ['camera'] }, opts));
    const page = await ctx.newPage(); const errs = [];
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED|net::/.test(m.text())) errs.push(`console: ${m.text()}`); });
    return { ctx, page, errs };
  };

  let browser = await launch('ball3.y4m');

  console.log('\nFlow 1 — cold start on the demo feed');
  {
    const { ctx, page, errs } = await newPage(browser);
    await page.goto(url); await page.waitForTimeout(2500);
    const st = await page.evaluate(() => ({ frames: RallyEye.stats.frames, kind: RallyEye.src.kind, table: !!RallyEye.table.H, fb: document.getElementById('fbText').textContent, stage: document.body.classList.contains('stage') }));
    ok(st.frames > 30, 'demo feed renders frames', `${st.frames} frames`);
    ok(st.kind === 'demo', 'starts on the demo, not the camera');
    ok(st.table, 'demo table found automatically');
    ok(!st.stage, 'page opens in normal layout, not full screen');
    ok(errs.length === 0, 'no console or page errors', errs.join(' | ') || 'clean');
    await ctx.close();
  }

  console.log('\nFlow 2 — camera, automatic table, bounce accuracy against the clip truth');
  {
    const { ctx, page, errs } = await newPage(browser);
    await page.goto(url); await page.waitForTimeout(600);
    await page.click('#btnStart'); await page.waitForTimeout(2600);
    const started = await page.evaluate(() => ({ kind: RallyEye.src.kind, stage: document.body.classList.contains('stage'), table: !!RallyEye.table.H }));
    ok(started.kind === 'camera', 'camera opens');
    ok(started.stage, 'starting the camera opens full screen');
    ok(started.table, 'table found automatically from the camera');
    await page.evaluate(() => RallyEye.resetStats()); await page.waitForTimeout(9000);
    const r = await page.evaluate(() => ({ b: RallyEye.stats.bounces.map((x) => ({ u: x.u, v: x.v, in: x.in })), A: RallyEye.stats.bounceA, B: RallyEye.stats.bounceB, out: RallyEye.stats.out, fps: parseFloat(document.getElementById('fps').textContent) }));
    const onTable = r.b.filter((x) => x.in);
    const txs = truth.map((t) => t.x);
    const errsM = onTable.map((x) => Math.min(...txs.map((t) => Math.abs(t - x.u))));
    const mean = errsM.length ? errsM.reduce((a, b) => a + b, 0) / errsM.length : 99;
    const max = errsM.length ? Math.max(...errsM) : 99;
    ok(onTable.length >= 8, 'bounces detected over nine seconds', `${onTable.length} on the table`);
    ok(mean < 0.15, 'bounce lands near a true bounce point', `mean ${mean.toFixed(3)} m, worst ${max.toFixed(3)} m`);
    ok(r.out === 0, 'no false out calls while the ball stays on the table', `out=${r.out}`);
    ok(r.fps >= 24, 'runs at a usable frame rate', `${r.fps} fps`);
    ok(errs.length === 0, 'no errors during play', errs.join(' | ') || 'clean');
    await ctx.close();
  }

  console.log('\nFlow 3 — setting the table by tapping four corners');
  {
    const { ctx, page, errs } = await newPage(browser);
    await page.goto(url); await page.waitForTimeout(600);
    await page.click('#btnStart'); await page.waitForTimeout(2500);
    await page.evaluate(() => { RallyEye.cfg.corners = null; RallyEye.save(); location.reload(); });
    await page.waitForTimeout(1200); await page.click('#btnStart'); await page.waitForTimeout(2000);
    await page.evaluate(() => { RallyEye.cfg.corners = null; document.getElementById('btnCorners').click(); });
    await page.waitForTimeout(300);
    const box = await page.evaluate(() => { const r = document.getElementById('view').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    // the table in the clip occupies x 100..540, y 230..256 of a 640x360 frame
    const pts = [[100, 230], [540, 230], [540, 256], [100, 256]];
    for (const [px, py] of pts) { await page.mouse.click(box.x + (px / 640) * box.w, box.y + (py / 360) * box.h); await page.waitForTimeout(140); }
    await page.waitForTimeout(400);
    const res = await page.evaluate(() => {
      const c = RallyEye.cfg.corners; if (!c || c.length !== 4) return { n: c ? c.length : 0 };
      const m = c.map((p) => RallyEye.toTable(p.x, p.y));
      return { n: 4, mapped: m.map((q) => [+q.x.toFixed(2), +q.y.toFixed(2)]), mode: document.getElementById('viewport').dataset.mode, hintHidden: document.getElementById('hint').hidden };
    });
    ok(res.n === 4, 'four taps record four corners');
    const want = [[0, 0], [2.74, 0], [2.74, 1.53], [0, 1.53]];
    const good = res.mapped && res.mapped.every((p, i) => Math.abs(p[0] - want[i][0]) < 0.02 && Math.abs(p[1] - want[i][1]) < 0.02);
    ok(good, 'tapped corners map onto the real table dimensions', res.mapped ? JSON.stringify(res.mapped) : 'none');
    ok(res.mode === 'none' && res.hintHidden, 'tapping mode ends after the fourth corner');
    ok(errs.length === 0, 'no errors while setting corners', errs.join(' | ') || 'clean');
    await ctx.close();
  }

  console.log('\nFlow 4 — every setting can be changed, and settings survive a reload');
  {
    const { ctx, page, errs } = await newPage(browser);
    await page.goto(url); await page.waitForTimeout(800);
    await page.evaluate(() => document.querySelectorAll('#rail details.group').forEach((d) => { d.open = true; }));
    await page.waitForTimeout(200);
    const controls = await page.evaluate(() => {
      const out = { ranges: [], checks: [], selects: [] };
      document.querySelectorAll('#rail input[type=range]').forEach((el) => out.ranges.push(el.id));
      document.querySelectorAll('#rail input[type=checkbox]').forEach((el) => out.checks.push(el.id));
      document.querySelectorAll('#rail select').forEach((el) => out.selects.push(el.id));
      return out;
    });
    for (const id of controls.ranges) await page.evaluate((i) => { const el = document.getElementById(i); el.value = el.max; el.dispatchEvent(new Event('input', { bubbles: true })); el.value = el.min; el.dispatchEvent(new Event('input', { bubbles: true })); }, id);
    for (const id of controls.checks) { await page.click(`#${id}`); await page.waitForTimeout(60); await page.click(`#${id}`); await page.waitForTimeout(60); }
    for (const id of controls.selects) await page.evaluate((i) => { const el = document.getElementById(i); for (const o of el.options) { el.value = o.value; el.dispatchEvent(new Event('change', { bubbles: true })); } }, id);
    await page.waitForTimeout(800);
    const after = await page.evaluate(() => ({ frames: RallyEye.stats.frames, procW: RallyEye.cfg.procW, showMask: RallyEye.cfg.showMask, sound: RallyEye.cfg.sound }));
    ok(errs.length === 0, `all ${controls.ranges.length} sliders, ${controls.checks.length} switches and ${controls.selects.length} menus change without error`, errs.join(' | ') || 'clean');
    ok(after.frames > 30, 'tracker still running after changing every setting');
    await page.evaluate(() => { RallyEye.cfg.valMin = 61; RallyEye.cfg.zoneH = 1.4; RallyEye.save(); });
    await page.reload(); await page.waitForTimeout(900);
    const back = await page.evaluate(() => ({ valMin: RallyEye.cfg.valMin, zoneH: RallyEye.cfg.zoneH, slider: document.getElementById('valMin').value }));
    ok(back.valMin === 61 && back.zoneH === 1.4 && back.slider === '61', 'settings persist across a reload', JSON.stringify(back));
    await ctx.close();
  }

  console.log('\nFlow 5 — ball presets, sampling the ball, mirror, reset, snapshot, stopping');
  {
    const { ctx, page, errs } = await newPage(browser);
    await page.goto(url); await page.waitForTimeout(600);
    await page.click('#btnStart'); await page.waitForTimeout(2500);
    await page.evaluate(() => document.querySelector('[data-preset="orange"]').click());
    const orange = await page.evaluate(() => ({ p: RallyEye.cfg.preset, hi: RallyEye.cfg.hueMax, sat: RallyEye.cfg.satMin }));
    ok(orange.p === 'orange' && orange.sat > 40, 'orange preset applies a narrow warm range', JSON.stringify(orange));
    await page.evaluate(() => document.querySelector('[data-preset="white"]').click());
    const white = await page.evaluate(() => ({ p: RallyEye.cfg.preset, satMax: RallyEye.cfg.satMax, valMin: RallyEye.cfg.valMin, gate: RallyEye.cfg.motionGate }));
    ok(white.p === 'white' && white.satMax <= 25 && white.gate, 'white preset needs a bright, unsaturated, moving ball', JSON.stringify(white));
    // sample the ball colour from the video: the ball sits on the table band in this clip
    const box = await page.evaluate(() => { const r = document.getElementById('view').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    await page.evaluate(() => document.getElementById('btnPickBall').click());
    await page.mouse.click(box.x + (300 / 640) * box.w, box.y + (243 / 360) * box.h); await page.waitForTimeout(300);
    const picked = await page.evaluate(() => ({ preset: RallyEye.cfg.preset, mode: document.getElementById('viewport').dataset.mode, fb: document.getElementById('fbText').textContent }));
    ok(picked.preset === 'custom' && picked.mode === 'none', 'sampling from the video sets a custom colour and leaves picking mode', picked.fb);
    const before = await page.evaluate(() => JSON.stringify(RallyEye.cfg.corners));
    await page.evaluate(() => document.getElementById('btnMirror').click()); await page.waitForTimeout(400);
    const mirrored = await page.evaluate(() => ({ mirror: RallyEye.cfg.mirror, corners: JSON.stringify(RallyEye.cfg.corners), table: !!RallyEye.table.H }));
    ok(mirrored.mirror && mirrored.corners !== before && mirrored.table, 'mirror flips the view and keeps the table valid');
    await page.evaluate(() => document.getElementById('btnMirror').click()); await page.waitForTimeout(300);
    await page.evaluate(() => document.getElementById('btnReset').click());
    const reset = await page.evaluate(() => ({ a: RallyEye.stats.bounceA, b: RallyEye.stats.bounceB, out: RallyEye.stats.out, best: RallyEye.stats.best, hits: RallyEye.rally.hits }));
    ok(Object.values(reset).every((v) => v === 0), 'reset clears every counter', JSON.stringify(reset));
    const dl = page.waitForEvent('download', { timeout: 6000 }).catch(() => null);
    await page.evaluate(() => document.getElementById('btnSnapshot').click());
    const file = await dl;
    ok(!!file && /\.png$/.test(file.suggestedFilename()), 'snapshot saves a PNG', file ? file.suggestedFilename() : 'no download fired');
    await page.evaluate(() => document.getElementById('hudStart').click()); await page.waitForTimeout(900);
    const stopped = await page.evaluate(() => ({ kind: RallyEye.src.kind, label: document.getElementById('hudStart').textContent, live: document.getElementById('statusPill').textContent }));
    ok(stopped.kind === 'demo' && /Start camera/.test(stopped.label), 'stopping the camera returns to the demo', JSON.stringify(stopped));
    ok(errs.length === 0, 'no errors across the control flow', errs.join(' | ') || 'clean');
    await ctx.close();
  }

  console.log('\nFlow 6 — resizing and rotating the window while playing');
  {
    const { ctx, page, errs } = await newPage(browser);
    await page.goto(url); await page.waitForTimeout(600);
    await page.click('#btnStart'); await page.waitForTimeout(2400);
    const sizes = [{ width: 900, height: 500 }, { width: 500, height: 900 }, { width: 1440, height: 900 }];
    let bad = 0;
    for (const s of sizes) {
      await page.setViewportSize(s); await page.waitForTimeout(500);
      const r = await page.evaluate(() => { const c = document.getElementById('view').getBoundingClientRect(); return { w: Math.round(c.width), h: Math.round(c.height), cx: Math.round(c.left + c.width / 2), cy: Math.round(c.top + c.height / 2), rot: getComputedStyle(document.getElementById('rotate')).display !== 'none' }; });
      const centred = Math.abs(r.cx - s.width / 2) <= 2 && Math.abs(r.cy - s.height / 2) <= 2;
      const fits = r.w <= s.width + 1 && r.h <= s.height + 1;
      const wantRot = s.height > s.width && s.width < 900;
      if (!centred || !fits || r.rot !== wantRot) { bad++; console.log(`        ${s.width}x${s.height}: canvas ${r.w}x${r.h} at ${r.cx},${r.cy}, rotate prompt ${r.rot}`); }
    }
    ok(bad === 0, 'canvas refits and the rotate prompt follows the window through every resize');
    ok(errs.length === 0, 'no errors while resizing', errs.join(' | ') || 'clean');
    await ctx.close();
  }
  await browser.close();

  console.log('\nFlow 7 — the rules: a ball played from beyond the table is not called out');
  {
    browser = await launch('ball.y4m');
    let trials = 0, clean = 0, rallies = 0;
    for (let k = 0; k < 3; k++) {
      const { ctx, page, errs } = await newPage(browser);
      await page.goto(url); await page.waitForTimeout(20000);
      const r = await page.evaluate(() => ({ returns: RallyEye.stats.returns, out: RallyEye.stats.out, floor: RallyEye.demo.state.floorOut, deep: RallyEye.demo.state.deepHits, best: RallyEye.stats.best }));
      trials++;
      // the ball is struck from outside the play zone; the only wrong outcome is an out with no ball on the floor
      if (r.out <= r.floor) clean++;
      if (r.best >= 4) rallies++;
      console.log(`        trial ${k + 1}: ${r.deep} deep hits, ${r.returns} counted as returns, ${r.out} out vs ${r.floor} floor landings, best rally ${r.best}${errs.length ? ', errors: ' + errs.join(' | ') : ''}`);
      await ctx.close();
    }
    ok(clean === trials, 'never calls out more often than balls actually hit the floor', `${clean}/${trials} trials`);
    ok(rallies === trials, 'rallies continue through balls played from beyond the table', `${rallies}/${trials} trials reached four or more hits`);
    await browser.close();
  }

  console.log('\nFlow 8 — camera refused by the browser');
  {
    browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, permissions: [] });
    await ctx.grantPermissions([]); const page = await ctx.newPage();
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(url); await page.waitForTimeout(700);
    await page.evaluate(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' })); });
    await page.click('#btnStart'); await page.waitForTimeout(1200);
    const st = await page.evaluate(() => ({ pill: document.getElementById('statusPill').textContent, fb: document.getElementById('fbText').textContent, sub: document.getElementById('fbSub').textContent, btn: document.getElementById('btnStart').disabled, kind: RallyEye.src.kind }));
    ok(/blocked|error/i.test(st.pill) && /did not start/i.test(st.fb), 'a refused camera is reported clearly', `${st.pill} — ${st.fb}`);
    ok(/allow/i.test(st.sub), 'the message says how to fix it', st.sub);
    ok(!st.btn, 'the start button is usable again after a refusal');
    ok(st.kind === 'demo', 'the demo keeps running when the camera is refused');
    ok(errs.length === 0, 'a refusal raises no uncaught error', errs.join(' | ') || 'clean');
    await ctx.close(); await browser.close();
  }

  console.log(`\n${fail === 0 ? 'ALL END-TO-END CHECKS PASSED' : 'END-TO-END FAILURES'}: ${pass} passed, ${fail} failed`);
  server.close(); process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
