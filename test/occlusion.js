// Does the tracker survive a hand or bat passing in front of the ball? Compared against the same clip
// with nothing in the way.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const http = require('http'), fs = require('fs');
const SP = __dirname;
const server = http.createServer((req, res) => { fs.readFile('/home/user/Trash/index.html', (e, d) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); }); });
async function run(clip, url) {
  const meta = JSON.parse(fs.readFileSync(`${SP}/${clip}.truth.json`, 'utf8'));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${SP}/${clip}`, '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, permissions: ['camera'] });
  const page = await ctx.newPage(); const errs = [];
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(url); await page.waitForTimeout(600);
  await page.evaluate((c) => { RallyEye.cfg.corners = c.map((p) => ({ x: p[0] / 640, y: p[1] / 480 })); RallyEye.cfg.cornersManual = true; RallyEye.save(); }, meta.corners);
  await page.reload(); await page.waitForTimeout(900);
  const ready = await page.evaluate(() => !!RallyEye.table.H);
  if (!ready) throw new Error('the table did not come back after reload');
  await page.click('#btnStart'); await page.waitForTimeout(2500);
  await page.evaluate(() => { RallyEye.resetStats(); window.__rec = []; const step = () => { const t = RallyEye.track; window.__rec.push({ a: t.active ? 1 : 0, c: t.coast ? 1 : 0 }); requestAnimationFrame(step); }; requestAnimationFrame(step); });
  await page.waitForTimeout(11000);
  const rec = await page.evaluate(() => window.__rec);
  const st = await page.evaluate(() => ({ tracks: RallyEye.stats.tracks, coasted: RallyEye.track.coasted, b: RallyEye.stats.bounces.map((x) => ({ u: x.u, v: x.v, in: x.in })), out: RallyEye.stats.out, A: RallyEye.stats.bounceA, B: RallyEye.stats.bounceB }));
  await browser.close();
  let drops = 0; for (let i = 1; i < rec.length; i++) if (rec[i - 1].a && !rec[i].a) drops++;
  const active = rec.filter((r) => r.a).length, coasting = rec.filter((r) => r.c).length;
  const tb = meta.truth.filter((t) => t.kind === 'table');
  const onT = st.b.filter((x) => x.in);
  const errsM = onT.map((x) => Math.min(...tb.map((t) => Math.hypot(t.x - x.u, t.y - x.v))));
  return { samples: rec.length, activePct: Math.round(active / rec.length * 100), coastPct: Math.round(coasting / rec.length * 100), drops, tracks: st.tracks, coasted: st.coasted, bounces: onT.length, out: st.out, err: errsM.length ? errsM.reduce((a, b) => a + b, 0) / errsM.length : NaN, errs };
}
(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  const clean = await run('room1.y4m', url);
  const occ = await run('room_occ.y4m', url);
  const row = (n, r) => `  ${n.padEnd(26)} tracked ${String(r.activePct).padStart(3)}% of the time, ${String(r.coastPct).padStart(2)}% of it predicted, ${r.drops} losses, ${r.tracks} re-acquisitions, ${r.bounces} bounces at ${isNaN(r.err) ? 'n/a' : r.err.toFixed(3) + ' m'}, ${r.out} out`;
  console.log('\nSame table, same ball, one clip with a hand crossing in front of the ball 4 times every 3 seconds:');
  console.log(row('nothing in the way', clean));
  console.log(row('hand crossing the ball', occ));
  console.log(`\n  coasted frames while hidden: ${occ.coasted}`);
  let fail = 0;
  const ok = (c, n, d) => { if (c) console.log(`  PASS  ${n}${d ? ' — ' + d : ''}`); else { fail++; console.log(`  FAIL  ${n}${d ? ' — ' + d : ''}`); } };
  console.log('');
  ok(occ.coasted > 0, 'the ball is carried on while it is hidden', `${occ.coasted} predicted frames`);
  ok(occ.activePct >= clean.activePct - 8, 'a hand in the way barely costs any tracking time', `${occ.activePct}% against ${clean.activePct}%`);
  ok(occ.drops <= clean.drops + 2, 'the hand does not make the tracker lose the ball', `${occ.drops} losses against ${clean.drops}`);
  ok(!isNaN(occ.err) && occ.err < 0.15, 'bounce accuracy holds up with the hand in the way', `${occ.err.toFixed(3)} m`);
  ok(occ.errs.length === 0 && clean.errs.length === 0, 'no errors');
  console.log(`\n${fail === 0 ? 'OCCLUSION CHECKS PASSED' : 'OCCLUSION FAILURES: ' + fail}`);
  server.close(); process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
