// Builds the plugin into dist/: code.js for Figma's main sandbox and ui.html
// with the UI bundle and styles inlined (Figma loads the UI as one HTML
// string, so it cannot fetch sibling files).
//
//   node scripts/build.mjs --mode dev|prod [--api <origin>] [--watch]
//
// The API origin is fixed per build: --api, else OGEN_API_URL, else the mode
// default. It must be listed in manifest.json networkAccess, which Figma
// enforces. npm scripts pass --api rather than an inline env assignment,
// which Windows' cmd can't parse.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import * as esbuild from 'esbuild'

const DEFAULT_API = {
  dev: 'http://localhost:9001',
  prod: 'https://api.getogen.com',
}

const { values: args } = parseArgs({
  options: {
    mode: { type: 'string', default: 'prod' },
    api: { type: 'string' },
    watch: { type: 'boolean', default: false },
  },
})

const mode = args.mode
if (!(mode in DEFAULT_API)) {
  fail(`unknown --mode "${mode}", expected dev or prod`)
}
const apiBase = (args.api ?? process.env.OGEN_API_URL ?? DEFAULT_API[mode]).replace(/\/+$/, '')

const manifest = JSON.parse(await readFile('manifest.json', 'utf8'))
checkNetworkAccess(manifest, apiBase, mode)

const define = {
  __API_BASE__: JSON.stringify(apiBase),
  __DEV__: String(mode === 'dev'),
}

const mainOptions = {
  entryPoints: ['src/main/code.ts'],
  outfile: 'dist/code.js',
  bundle: true,
  format: 'iife',
  // Figma's main-thread sandbox lags browsers on syntax support.
  target: 'es2017',
  define,
  minify: mode === 'prod',
  logLevel: 'info',
}

const uiOptions = {
  entryPoints: ['src/ui/main.tsx'],
  outdir: 'dist/ui',
  bundle: true,
  format: 'iife',
  target: 'es2020',
  jsx: 'automatic',
  jsxImportSource: 'preact',
  define,
  minify: mode === 'prod',
  write: false,
  logLevel: 'info',
  plugins: [inlineIntoHtml()],
}

await mkdir('dist', { recursive: true })
console.log(`[build] mode=${mode} api=${apiBase}`)

if (args.watch) {
  const contexts = await Promise.all([esbuild.context(mainOptions), esbuild.context(uiOptions)])
  await Promise.all(contexts.map((ctx) => ctx.watch()))
  console.log(
    [
      '[build] watching for changes…',
      '',
      '  There is no web page to open: the plugin runs inside Figma desktop.',
      '  1. Figma desktop → Plugins → Development → Import plugin from manifest… → manifest.json',
      '  2. Plugins → Development → Ogen (re-run it to pick up a rebuild)',
      `  3. The plugin calls the Ogen API at ${apiBase}; start it there first.`,
      '',
    ].join('\n'),
  )
} else {
  await Promise.all([esbuild.build(mainOptions), esbuild.build(uiOptions)])
}

// inlineIntoHtml writes dist/ui.html from src/ui/index.html with the bundled
// JS and CSS in place of their placeholders.
function inlineIntoHtml() {
  return {
    name: 'inline-into-html',
    setup(build) {
      build.onEnd(async (result) => {
        if (result.errors.length > 0) return
        const files = result.outputFiles ?? []
        const js = files.filter((f) => f.path.endsWith('.js')).map((f) => f.text).join('\n')
        const css = files.filter((f) => f.path.endsWith('.css')).map((f) => f.text).join('\n')
        const template = await readFile('src/ui/index.html', 'utf8')
        // Function replacers: the bundle may contain "$&"-style sequences.
        const html = template
          .replace('<!-- INLINE_CSS -->', () => `<style>${css}</style>`)
          .replace('<!-- INLINE_JS -->', () => `<script>${js.replace(/<\/script/gi, '<\\/script')}</script>`)
        await writeFile('dist/ui.html', html)
      })
    },
  }
}

function checkNetworkAccess(manifest, origin, mode) {
  const access = manifest.networkAccess ?? {}
  const allowed = [...(access.allowedDomains ?? []), ...(mode === 'dev' ? access.devAllowedDomains ?? [] : [])]
  if (!allowed.includes(origin)) {
    fail(
      `API origin ${origin} is not in manifest.json networkAccess ` +
        `(${mode === 'dev' ? 'allowedDomains or devAllowedDomains' : 'allowedDomains'}); Figma would block every request`,
    )
  }
}

function fail(msg) {
  console.error(`[build] ${msg}`)
  process.exit(1)
}
