# Day-one spikes (CON-340)

Run these in Figma desktop against a `build:dev` bundle and record the answers
here and on CON-338. With a dev build, the main thread logs a readout line to
the plugin console (Plugins → Development → Show/Hide console):

```
[ogen] editorType=figma file=<file name> user=<name or null>
```

## D5: does `exportAsync` work in Dev Mode?

1. In `manifest.json`, set `"editorType": ["figma", "dev"]` and add
   `"capabilities": ["inspect"]` (Dev Mode plugins must declare the inspect
   capability). Rebuild and re-import.
2. Open a file in Dev Mode with a Dev seat, run the plugin from the Dev Mode
   plugins panel, select a frame, and send it.
3. Expected readout: `editorType=dev`.
4. Record: does the export succeed, and does the send reach Ogen?

If it works, keep both editor types (Dev-seat users can send). If not, revert
to `["figma"]`.

Result: _not yet run_

## Is `figma.root.name` readable from a public plugin?

`figma.fileKey` needs the private plugin API, so provenance relies on the file
name. Check that the readout shows the real file name, not an empty string.

Result: _not yet run_

## Are sections and groups exportable?

Select a section and a group, send both, and confirm both arrive as images.

Result: _not yet run_

## Video export (CON-347)

Run with a frame animated with Figma Motion. Record each answer here and on
CON-347.

1. **Time and size**: export a 1080×1920, 10 s animation as MP4 and WebM at
   Low, Medium and High. How long does `exportAsync` take, how big is each
   file, and does the editor freeze while it runs? Use the sizes to set
   `max_video_bytes` and the default quality.
2. **Free plan**: does video export work on a file in a free Starter team?
3. **Transfer**: does a 100 MB+ export reach the UI over
   `figma.ui.postMessage` without errors?
4. **Detection**: does a frame with only prototype Smart Animate (no Motion)
   report empty `timelines`, and does `exportAsync` reject it?
5. **Server**: does the MP4 pass video-service probing and the Instagram
   Reels, TikTok and YouTube Shorts rules without transcoding?
6. **Storage**: does the PUT to the presigned R2 URL work from the plugin
   iframe (origin `null`) with the bucket's CORS rules, and does Figma accept
   `https://*.r2.cloudflarestorage.com` in `allowedDomains`?

Result: _not yet run_
