// Once settings are open there must always be a visible way back to the camera, at any scroll position,
// on a phone-sized screen, by every route a person would try.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const http = require('http'), fs = require('fs');
const SP = __dirname;
const server = http.createServer((req, res) => { fs.readFile('/home/user/Trash/index.html', (e, d) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); }); });
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log(`  PASS  ${n}${d ? ' — ' + d : ''}`); } else { fail++; console.log(`  FAIL  ${n}${d ? ' — ' + d : ''}`); } };
const SIZES = [
  { name: 'iPhone landscape 844x390', w: 844, h: 390 },
  { name: 'iPhone portrait 390x844', w: 390, h: 844 },
  { name: 'small phone 360x640', w: 360, h: 640 },
  { name: 'laptop 1440x900', w: 1440, h: 900 },
];
(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${SP}/ball3.y4m`, '--autoplay-policy=no-user-gesture-required'] });
  for (const sz of SIZES) {
    console.log(`\n${sz.name}`);
    const ctx = await browser.newContext({ viewport: { width: sz.w, height: sz.h }, hasTouch: true, permissions: ['camera'] });
    const page = await ctx.newPage(); const errs = [];
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(url); await page.waitForTimeout(600);
    await page.evaluate(() => document.getElementById('btnStart').click()); await page.waitForTimeout(2300);
    const open = async () => { await page.evaluate(() => document.getElementById('hudSettings').click()); await page.waitForTimeout(350); };
    const isOpen = () => page.evaluate(() => document.getElementById('rail').classList.contains('open'));

    await open();
    ok(await isOpen(), 'settings open from the camera view');
    const geo = await page.evaluate(() => {
      const r = document.getElementById('rail').getBoundingClientRect(), c = document.getElementById('drawerClose').getBoundingClientRect();
      return { railLeft: Math.round(r.left), railW: Math.round(r.width), vw: window.innerWidth, closeVisible: c.top >= -1 && c.bottom <= window.innerHeight + 1 && c.width > 0, closeBox: { x: Math.round(c.left), y: Math.round(c.top), w: Math.round(c.width), h: Math.round(c.height) } };
    });
    ok(geo.railLeft > 2, 'a strip of the camera stays visible beside the panel', `panel ${geo.railW}px of ${geo.vw}px, ${geo.railLeft}px strip`);
    ok(geo.closeVisible, 'the Close button is on screen when it opens', JSON.stringify(geo.closeBox));

    // scroll the settings all the way down: the header must not have scrolled away
    await page.evaluate(() => { const b = document.getElementById('railBody'); b.scrollTop = b.scrollHeight; });
    await page.waitForTimeout(250);
    const after = await page.evaluate(() => {
      const c = document.getElementById('drawerClose').getBoundingClientRect(), d = document.getElementById('drawerDone').getBoundingClientRect(), b = document.getElementById('railBody');
      return { scrolled: b.scrollTop > 40, closeVisible: c.top >= -1 && c.bottom <= window.innerHeight + 1, doneVisible: d.top >= -1 && d.bottom <= window.innerHeight + 1 && d.width > 0, scrollTop: Math.round(b.scrollTop), max: Math.round(b.scrollHeight - b.clientHeight) };
    });
    ok(after.scrolled, 'the settings list scrolls', `${after.scrollTop} of ${after.max}px`);
    ok(after.closeVisible, 'the Close button is still on screen at the bottom of the list');
    ok(after.doneVisible, 'a Back to the camera button waits at the end of the list');

    // route 1: the Done button at the end
    await page.evaluate(() => document.getElementById('drawerDone').click()); await page.waitForTimeout(400);
    ok(!(await isOpen()), 'Back to the camera closes it');

    // route 2: the Close button in the header
    await open(); await page.evaluate(() => document.getElementById('drawerClose').click()); await page.waitForTimeout(400);
    ok(!(await isOpen()), 'Close closes it');

    // route 3: tapping the strip of camera beside the panel
    await open();
    await page.mouse.click(Math.max(4, Math.round(geo.railLeft / 2)), Math.round(sz.h / 2)); await page.waitForTimeout(400);
    ok(!(await isOpen()), 'tapping the camera beside the panel closes it');

    // route 4: the phone back gesture
    await open(); await page.goBack().catch(() => {}); await page.waitForTimeout(500);
    const backClosed = !(await isOpen());
    const stillLive = await page.evaluate(() => RallyEye.src.kind);
    ok(backClosed, 'the back gesture closes it');
    ok(stillLive === 'camera', 'the back gesture does not leave the app', `source is ${stillLive}`);

    // and the camera keeps running the whole time
    const running = await page.evaluate(() => RallyEye.stats.frames);
    await page.waitForTimeout(600);
    const running2 = await page.evaluate(() => RallyEye.stats.frames);
    ok(running2 > running, 'the camera keeps tracking while settings are used', `${running} then ${running2} frames`);
    ok(errs.length === 0, 'no errors', errs.join(' | ') || 'clean');
    await open(); await page.screenshot({ path: `${SP}/drawer-${sz.w}x${sz.h}.png` });
    await ctx.close();
  }
  console.log(`\n${fail === 0 ? 'DRAWER CHECKS PASSED' : 'DRAWER FAILURES'}: ${pass} passed, ${fail} failed`);
  await browser.close(); server.close(); process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
