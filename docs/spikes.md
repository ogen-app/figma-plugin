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
