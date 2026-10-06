figma.showUI(__html__, { width: 360, height: 540, themeColors: true })

if (__DEV__) {
  // Spike readout (docs/spikes.md): which editor we run in, and whether the
  // file name and current user are visible to a public plugin.
  console.log('[ogen] editorType=%s file=%s user=%s', figma.editorType, figma.root.name, figma.currentUser?.name ?? null)
}
