---
name: video-frames
description: "Turn video (Playwright browser recordings, screen/webcam captures,
  any video file) into frames, and crop regions of interest out of frames for
  vision analysis. Use when the user asks to 'record the browser', 'take a video
  of the page', 'split the video into frames', 'extract frames', 'crop the
  screenshot', 'zoom into that area', 'check what the UI did', debug a UI flow
  over time, or analyze anything that moves. Frames are the universal path —
  Claude (sonnet/opus 5) and GPT-5.x have NO native video input (Anthropic's own
  recipe is break video into frames and do vision on them), and crow's image
  pipeline (read_image_file) already ships them to any vision model."
---

# Video → Frames → ROI Crops

## Why frames

- ACP has no video content block (v1 or v2); MCP has no Video type. Claude and
  GPT accept text + images (+ PDF for Claude). Only qwen3.x-max on DashScope
  takes `video_url` natively, and crow's pipeline is image-based anyway.
- Frames + crops work with EVERY vision model and with crow's existing
  pipeline: `read_image_file` persists the image into the session DB and
  hydrates it as a base64 data URL at LLM send (max dim capped at 1568px).

## 1. Get a video

### A. Playwright recording via `browser_run_code_unsafe` (verified)

`recordVideo` can only be set at context creation, so spin up a NEW context
from the managed page's browser. This snippet is verified end-to-end:

```js
async (page) => {
  const browser = page.context().browser();
  const dir = '/tmp/crow-video';
  const ctx = await browser.newContext({
    recordVideo: { dir, size: { width: 800, height: 600 } },
  });
  const p = await ctx.newPage();
  await p.goto('https://example.com');   // do the thing you want captured
  await p.waitForTimeout(1000);
  const video = p.video();
  await p.close();                        // MUST close page to finalize video
  const dest = dir + '/demo.webm';
  await video.saveAs(dest);
  await ctx.close();
  return dest;
}
```

Gotchas (all hit in practice):
- The run_code VM is sandboxed ESM: NO `require`, NO dynamic `import`. Don't
  touch `fs` — Playwright creates the dir itself; verify the file from
  `terminal`.
- `saveAs` only works after `p.close()` (the webm is finalized on close).
- Playwright records WebM/VP8 only. ffmpeg reads it fine.
- Omit `size` to match the viewport.

### B. `--video` on the playwright MCP server

If `~/.agents/crow/config.yaml` has `--video` in the playwright
`mcpServers` args, the managed context records automatically; grab the file
with `page.video().saveAs(...)` before the session ends. Needs a fresh agent
session to pick up (config is read at session start).

### C. Screen / webcam via ffmpeg

```bash
ffmpeg -y -f x11grab -i :0 -t 5 screen.mp4            # 5s of the desktop
ffmpeg -y -f v4l2 -i /dev/video6 -t 5 cam.mp4         # webcam (index 6 on this box)
```

## 2. Split into frames

```bash
mkdir -p frames
# uniform sampling, N frames per second (1 fps is a good default)
ffmpeg -y -v error -i video.webm -vf fps=1 frames/f_%03d.png
# exact frame count: duration from ffprobe, fps = count/duration
ffprobe -v error -show_entries format=duration -of csv=p=0 video.webm
# only visual change points (UI transitions, page loads)
ffmpeg -y -v error -i video.webm -vf "select='gt(scene,0.3)'" -vsync vfr frames/scene_%03d.png
# one frame at a timestamp
ffmpeg -y -v error -ss 1.5 -i video.webm -frames:v 1 frames/t1.5.png
```

- `-vsync vfr` is REQUIRED with the scene select, or you get duplicated frames.
- Scene threshold: 0.3 for real cuts; static UI content needs 0.05–0.1 (a
  page reload scored ~0.1 here; at 0.3 you get NOTHING on a static page).
- Feed the vision model 4–12 frames, named in order, and ask temporal
  questions ("what changed between f_003 and f_007?"). Downscale huge frames
  first (`-vf scale=1280:-2`) — the 1568px cap applies at send time anyway.

## 3. Crop regions of interest

```bash
# ffmpeg: crop=W:H:X:Y
ffmpeg -y -v error -i frames/f_001.png -vf crop=400:300:200:150 roi.png
# ImageMagick (note +repage, or the crop keeps the old canvas offsets)
convert frames/f_001.png -crop 400x300+200+150 +repage roi.png
```

Finding X/Y:
- Best: `browser_evaluate` → `el.getBoundingClientRect()` on the element of
  interest while the page is live; reuse those coords on same-size frames.
- Otherwise eyeball the full frame with `read_image_file` and crop generous
  margins; re-crop tighter if the first pass misses.
- Crop BEFORE sending, not after: a 4K frame downscaled to 1568px makes small
  UI text unreadable, but a tight crop of the same text is crisp.

## 4. Analyze

`read_image_file` each frame/crop. It persists the image into the session DB
and the model sees it as an image block. For flows, send several frames in
one turn in chronological order and ask what changed.

## Environment notes

- ffmpeg is required (`sudo apt install -y ffmpeg`); verified v6.1.1 on this
  box. ImageMagick `convert` also present as a crop fallback.
- Verified test artifact layout: record → `/tmp/crow-video/*.webm`,
  frames → `frames/`, crops → `roi*.png`, then `read_image_file`.
