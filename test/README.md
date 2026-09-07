# Tests

Headless Chromium drives the real page with a fake camera device, so the same
code path the browser uses on a webcam is exercised end to end.

- `layout.js` — at six window sizes and three states, asserts the scoreboard,
  buttons, hint and feedback strip are present, never overlap each other, stay
  on screen, and that the video is centred and fits.
- `mobile.js` — pretends to be Safari on an iPhone, with no Fullscreen API and browser bars covering part of
  the window, and checks the app fills exactly the space left, keeps the picture and controls clear of the
  bars, carries the home-screen tags, and offers the add-to-home-screen route only when it is needed.
- `drawer.js` — opens the settings panel from the camera view at four screen sizes and checks every way back
  out: the header Close, the button at the end of the list, tapping the camera beside the panel, and the
  phone's back gesture, including after scrolling the list to the bottom.
- `e2e.js` — cold start, opening the camera, automatic table finding, bounce
  accuracy against the clip's known bounce points, tapping the four corners,
  every slider, switch and menu, settings persistence, presets, sampling the
  ball, mirror, reset, snapshot, stopping, resizing and rotating, the
  beyond-the-table rules, and a refused camera.

Both need a synthetic clip. Generate one with a short script that writes a
`.y4m` file of a ball bouncing on a table, then run:

```
node test/layout.js
node test/e2e.js
node test/mobile.js
node test/drawer.js
```
