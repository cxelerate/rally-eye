# Rally Eye

A table tennis ball and table tracker that runs entirely in the browser on your built-in camera. No install, no server, no video leaves your device.

Live at https://cxelerate.github.io/rally-eye/ — open it in Chrome, Edge, Safari or Firefox and press **Start camera**. Or open `index.html` directly.

The page must be open in its own tab. Browsers do not pass camera permission into an embedded frame such as the Claude artifact panel, so when the page notices it is embedded it offers to save itself as a file you can open directly.

## What it does

- Tracks only the ball in play: a moving, ball-sized, round blob inside the play zone above the table that holds a smooth path at ball speed for four frames. Nothing is tracked until the table is set. Balls on the floor, spare balls sitting on the table, lettering on the table, the net and sensor noise are ignored.
- White ball by default, with an orange preset, or sample the real ball from the video.
- Finds the table by colour, or lets you tap its four corners, with draggable handles to fine-tune. The four corners become a homography, so the tracker knows how large a 40 mm ball must look, where the play zone is, and where each bounce lands.
- Detects bounces and paddle hits, judges each bounce in or out, places it on a top-down map of the 2.74 m × 1.525 m table, counts the rally and calls double bounces. A ball that leaves beyond the table's edge stays live: a return from the same end continues the rally, and out is called only if nothing comes back within the return window (3 s by default).
- Estimates ball speed in km/h from the table scale, and keeps top speed and best rally.
- Gives live feedback in a scoreboard strip, with a click on every bounce, a low tone for out, and optional spoken rally counts.

A demo feed runs through the same tracker while the camera is off, so the page shows what it does before you set anything up.

## Setup that works best

1. Put the laptop at the side of the table, roughly level with the net, with the whole table in frame. Bounces and hits read best from the side.
2. Steady light and a plain background. Keep other orange or white objects out of view.
3. Set the table first with **Find table automatically** or **Tap the 4 corners**, then keep the laptop still. Tracking is limited to the zone above the table only once the table is set.
4. If the ball is missed, turn on **Show what the tracker sees** under Detection. Only the ball should light up. Use **Pick from video** to sample its real colour under your lighting.

## Running locally

Any static server works, or open the file directly:

```
npx serve .
```

Camera access needs a secure context, so use `https://`, `http://localhost`, or the file itself.

## Notes on accuracy

- Speeds are estimates. The metre-per-pixel scale comes from the table plane, so they are best for a ball travelling low over the table.
- Bounce placement is exact only when the ball is on the surface, which is the moment it is measured. In tests against a simulated feed, bounces land within about 5 cm of the true spot.
- A paddle hit that also flips the ball upward looks like a bounce, so a bounce is held for a couple of frames and dropped if a hit lands at the same instant.
