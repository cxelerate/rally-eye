// Phone browsers keep bars over the page and refuse full screen. This pretends to be one and checks the app
// fits the space that is actually left, and explains how to get the whole screen.
const { chromium, devices } = require('/opt/node22/lib/node_modules/playwright');
const http = require('http'), fs = require('fs');
const SP = __dirname;
const server = http.createServer((req, res) => { fs.readFile('/home/user/Trash/index.html', (e, d) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); }); });
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log(`  PASS  ${n}${d ? ' — ' + d : ''}`); } else { fail++; console.log(`  FAIL  ${n}${d ? ' — ' + d : ''}`); } };
// Safari on iPhone has no Fullscreen API for a page, and keeps bars over it: BARS px of the window are not ours.
const iphoneInit = (bars) => `
  delete Element.prototype.requestFullscreen; delete Element.prototype.webkitRequestFullscreen;
  delete Document.prototype.exitFullscreen;
  Object.defineProperty(navigator, 'platform', { get: () => 'iPhone' });
  Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 });
  (() => { const real = window.visualViewport, t = new EventTarget();
    Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => ({
      get width() { return window.innerWidth; }, get height() { return window.innerHeight - ${bars}; },
      offsetTop: 0, offsetLeft: 0, pageTop: 0, pageLeft: 0, scale: 1,
      addEventListener: t.addEventListener.bind(t), removeEventListener: t.removeEventListener.bind(t) }) });
  })();`;
(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${SP}/ball3.y4m`, '--autoplay-policy=no-user-gesture-required'] });
  const BARS = 92;
  for (const [label, size] of [['iPhone landscape 844x390', { width: 844, height: 390 }], ['iPhone portrait 390x844', { width: 390, height: 844 }]]) {
    console.log(`\n${label}, with ${BARS}px of browser bars`);
    const ctx = await browser.newContext({ viewport: size, hasTouch: true, isMobile: true, deviceScaleFactor: 3, permissions: ['camera'], userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
    await ctx.addInitScript(iphoneInit(BARS));
    const page = await ctx.newPage(); const errs = [];
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(url); await page.waitForTimeout(700);
    const head = await page.evaluate(() => ({
      viewport: (document.head.querySelector('meta[name=viewport]') || {}).content,
      apple: !!document.head.querySelector('meta[name="apple-mobile-web-app-capable"]'),
      status: (document.head.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]') || {}).content,
      manifest: !!document.head.querySelector('link[rel=manifest]'),
      touchIcon: !!document.head.querySelector('link[rel="apple-touch-icon"]'),
    }));
    ok(/viewport-fit=cover/.test(head.viewport || ''), 'viewport asks to cover the whole screen', head.viewport);
    ok(head.apple && head.status === 'black-translucent', 'home-screen tags present so it opens without browser bars');
    ok(head.manifest && head.touchIcon, 'app manifest and icon present');
    await page.evaluate(() => document.getElementById('btnStart').click()); await page.waitForTimeout(2500);
    const vis = await page.evaluate(() => ({ w: visualViewport.width, h: visualViewport.height, iw: window.innerWidth, ih: window.innerHeight }));
    const geo = await page.evaluate(() => {
      const r = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }; };
      return { canvas: r(document.getElementById('view')), stage: r(document.getElementById('stageUi')), fb: r(document.getElementById('feedback')), rotate: getComputedStyle(document.getElementById('rotate')).display !== 'none', install: getComputedStyle(document.getElementById('install')).display !== 'none' };
    });
    ok(geo.stage.h === Math.round(vis.h) && geo.stage.w === Math.round(vis.w), 'the app fills exactly the space the bars leave', `stage ${geo.stage.w}x${geo.stage.h}, visible ${vis.w}x${vis.h} of a ${vis.iw}x${vis.ih} window`);
    ok(geo.canvas.y + geo.canvas.h <= vis.h + 1 && geo.canvas.h <= vis.h + 1, 'the camera picture is not cut off by the bars', `canvas ${geo.canvas.w}x${geo.canvas.h} ending at y=${geo.canvas.y + geo.canvas.h}`);
    ok(geo.fb.y + geo.fb.h <= vis.h + 1, 'the feedback strip stays above the bottom bar', `ends at y=${geo.fb.y + geo.fb.h} of ${vis.h}`);
    const portrait = size.height > size.width;
    ok(geo.rotate === portrait, `rotate prompt ${portrait ? 'shown upright' : 'hidden in landscape'}`);
    ok(geo.install === !portrait, `full-screen advice ${portrait ? 'held back until turned' : 'offered when the browser refuses full screen'}`);
    if (!portrait) {
      const steps = await page.evaluate(() => [...document.querySelectorAll('#installSteps li')].map((l) => l.textContent));
      ok(steps.length === 3 && /Share/.test(steps[0]) && /Add to Home Screen/.test(steps[1]), 'the advice gives the Safari steps', steps.join(' '));
      await page.evaluate(() => document.getElementById('installDismiss').click()); await page.waitForTimeout(200);
      const gone = await page.evaluate(() => getComputedStyle(document.getElementById('install')).display === 'none' && RallyEye.cfg.installDismissed);
      ok(gone, 'the advice can be dismissed and stays dismissed');
    }
    ok(errs.length === 0, 'no errors', errs.join(' | ') || 'clean');
    await page.screenshot({ path: `${SP}/mobile-${size.width}x${size.height}.png` });
    await ctx.close();
  }
  // added to the home screen: no bars, so no advice
  console.log('\nAdded to the home screen (standalone)');
  {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, permissions: ['camera'] });
    await ctx.addInitScript(iphoneInit(0) + `; Object.defineProperty(navigator, 'standalone', { get: () => true });`);
    const page = await ctx.newPage(); await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await page.goto(url); await page.waitForTimeout(600);
    await page.evaluate(() => document.getElementById('btnStart').click()); await page.waitForTimeout(2200);
    const st = await page.evaluate(() => ({ install: getComputedStyle(document.getElementById('install')).display !== 'none', canvas: Math.round(document.getElementById('view').getBoundingClientRect().height), h: visualViewport.height }));
    ok(!st.install, 'no advice once it is running from the home screen');
    ok(st.canvas <= st.h + 1 && st.canvas > st.h * 0.5, 'the picture uses the full height there', `${st.canvas}px of ${st.h}px`);
    await ctx.close();
  }
  console.log(`\n${fail === 0 ? 'MOBILE CHECKS PASSED' : 'MOBILE FAILURES'}: ${pass} passed, ${fail} failed`);
  await browser.close(); server.close(); process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
