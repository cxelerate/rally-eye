// Alignment-free: does the tracker follow the ball's actual path, or something else in the room?
// Every reported position is compared with the whole set of true ball positions on the clip.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const http = require('http'), fs = require('fs');
const SP = __dirname, APP = process.env.APP || '/home/user/Trash/index.html';
const CLIP = process.env.CLIP || 'room_pf.y4m', CW = Number(process.env.CW || 640), CH = Number(process.env.CH || 480);
const server = http.createServer((req, res) => { fs.readFile(APP, (e, d) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); }); });
(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); const url = `http://127.0.0.1:${server.address().port}/index.html`;
  const meta = JSON.parse(fs.readFileSync(`${SP}/${CLIP}.truth.json`, 'utf8'));
  // The ball's real path, wherever it goes: following it past the end of the table is correct, not a mistake.
  // Frames where something is drawn over the ball are left out: the occluder sits on the ball, so counting
  // those would reward detecting the hand instead of the ball.
  const path = meta.perFrame.filter((p) => !p.occluded);
  const onTablePath = meta.perFrame.filter((p) => p.u >= -0.35 && p.u <= 3.09 && p.v >= -0.35 && p.v <= 1.875);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${SP}/${CLIP}`, '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, permissions: ['camera'] });
  const page = await ctx.newPage(); await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(url); await page.waitForTimeout(500);
  await page.evaluate((a) => { RallyEye.cfg.corners = a.c.map((p) => ({ x: p[0] / a.cw, y: p[1] / a.ch })); RallyEye.cfg.cornersManual = true; if (a.w) RallyEye.cfg.procW = a.w; Object.assign(RallyEye.cfg, a.over); RallyEye.save(); }, { c: meta.corners, w: Number(process.env.PROCW || 0), cw: CW, ch: CH, over: JSON.parse(process.env.OVER || '{}') });
  await page.reload(); await page.waitForTimeout(900);
  await page.click('#btnStart'); await page.waitForTimeout(3000);
  await page.evaluate((s) => {
    window.__d = []; let n = -1;
    const step = () => {
      const f = RallyEye.stats.frames;
      if (f !== n) { n = f; const t = RallyEye.track, p = t.pts[t.pts.length - 1];
        window.__d.push(t.active && !t.coast && p ? { x: p.x * s.cw / RallyEye.proc.w, y: p.y * s.ch / RallyEye.proc.h } : null); }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, { cw: CW, ch: CH });
  await page.waitForTimeout(10000);
  const d = await page.evaluate(() => window.__d);
  const info = await page.evaluate(() => ({ w: RallyEye.proc.w, r: +RallyEye.table.rMin.toFixed(2), rmax: +RallyEye.table.rMax.toFixed(2), fps: parseFloat(document.getElementById('fps').textContent) }));
  await browser.close(); server.close();
  const tol = 6 * (CW / 640);
  const reported = d.filter(Boolean);
  let on = 0, sum = 0;
  for (const p of reported) { let best = 1e9; for (const t of path) { const e = Math.hypot(p.x - t.x, p.y - t.y); if (e < best) best = e; } if (best <= tol) { on++; sum += best; } }
  console.log(`  frames observed:              ${d.length}  (ball over the table on ${onTablePath.length} of the clip's ${meta.perFrame.length} frames)`);
  console.log(`  a position was reported on:   ${reported.length} (${Math.round(reported.length / d.length * 100)}% of frames)`);
  console.log(`  of those, on the ball's path: ${on} (${Math.round(on / Math.max(1, reported.length) * 100)}%), off it: ${reported.length - on}`);
  console.log(`  distance from the path:       ${(sum / Math.max(1, on)).toFixed(1)} px within a ${tol.toFixed(0)} px tolerance, frame ${CW} wide`);
  // where are the wrong ones? group them so the pattern is visible instead of guessed at
  const off = [];
  for (const p of reported) { let best = 1e9; for (const t of path) { const e = Math.hypot(p.x - t.x, p.y - t.y); if (e < best) best = e; } if (best > tol) off.push(p); }
  const groups = [];
  for (const p of off) { const g = groups.find((q) => Math.hypot(q.x / q.n - p.x, q.y / q.n - p.y) < 40 * (CW / 640)); if (g) { g.x += p.x; g.y += p.y; g.n++; } else groups.push({ x: p.x, y: p.y, n: 1 }); }
  groups.sort((a, b) => b.n - a.n);
  console.log(`  where the wrong ones sit:     ${groups.slice(0, 6).map((g) => `${g.n}x at (${Math.round(g.x / g.n)},${Math.round(g.y / g.n)})`).join('  ') || 'none'}`);
  const tq = meta.corners;
  console.log(`  table corners for reference:  ${JSON.stringify(tq)}`);
  console.log(`  ${process.env.LABEL || ''} processing ${info.w} px wide, ball radius ${info.r}-${info.rmax} px, ${info.fps} fps${errs.length ? ', errors: ' + errs.join(' | ') : ''}`);
})().catch((e) => { console.error(e); process.exit(1); });
