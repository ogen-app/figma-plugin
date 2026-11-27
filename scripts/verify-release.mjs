// Checks that manifest.json and dist/ are a production build fit to publish.
// Figma uploads them exactly as they are on disk, so this runs on every
// release (CI on a v* tag, and RELEASE.md step 2 before a manual publish).
//
//   node scripts/verify-release.mjs [--tag v1.2.3] [--dir <release files>]
//
// With --tag, the tag must match package.json's version. --dir checks the
// manifest.json and dist/ of an unzipped release elsewhere (a rollback
// candidate) against this checkout's rules. Exits 1 and lists every failed
// check.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { DEFAULT_API, PROD_DOMAINS } from './origins.mjs'

const PLACEHOLDER_ID = 'ogen-send-to-ogen'

const { values: args } = parseArgs({ options: { tag: { type: 'string' }, dir: { type: 'string', default: '.' } } })

const manifest = JSON.parse(await readFile(join(args.dir, 'manifest.json'), 'utf8'))
const pkg = JSON.parse(await readFile('package.json', 'utf8'))
const ui = await readFile(join(args.dir, 'dist/ui.html'), 'utf8')
const code = await readFile(join(args.dir, 'dist/code.js'), 'utf8')

const current = JSON.parse(await readFile('manifest.json', 'utf8'))

const allowed = manifest.networkAccess?.allowedDomains ?? []
// Development origins come from this checkout's manifest as well as the
// candidate's, so an old release is judged by today's dev origins too.
const devDomains = [current, manifest].flatMap((m) => m.networkAccess?.devAllowedDomains ?? [])
const devHosts = [...new Set(['localhost', '127.0.0.1', ...devDomains.map(host)])]

const failures = []
const check = (ok, msg) => ok || failures.push(msg)

check(manifest.id !== PLACEHOLDER_ID && /^\d+$/.test(manifest.id ?? ''), `manifest id "${manifest.id}" is not a real Figma plugin id`)
for (const origin of PROD_DOMAINS) {
  check(allowed.includes(origin), `allowedDomains is missing ${origin}`)
}
for (const origin of allowed) {
  check(PROD_DOMAINS.includes(origin), `allowedDomains entry ${origin} is not an approved production origin`)
}
check(ui.includes(DEFAULT_API.prod), `dist/ui.html does not call the production API ${DEFAULT_API.prod}`)
for (const h of devHosts) {
  // A wildcard entry (*.example.com) is matched by its fixed suffix.
  const needle = h.replace(/^\*\./, '.')
  check(!ui.includes(needle) && !code.includes(needle), `dist/ contains the development origin ${h}`)
}
check(!code.includes('[ogen] editorType'), 'dist/code.js is a dev build (it prints the spike readout)')
if (args.tag !== undefined) {
  check(args.tag === `v${pkg.version}`, `tag ${args.tag} does not match package.json version v${pkg.version}`)
}

if (failures.length > 0) {
  console.error(`[verify] not a publishable production build:\n${failures.map((f) => `  - ${f}`).join('\n')}`)
  process.exit(1)
}
console.log(`[verify] ok: ${args.dir === '.' ? `v${pkg.version}` : args.dir}, plugin ${manifest.id}, api ${DEFAULT_API.prod}, network ${allowed.join(' ')}`)

// host returns an origin's hostname, keeping a leading "*." wildcard, which
// URL can't parse.
function host(origin) {
  return origin.replace(/^[a-z]+:\/\//, '').replace(/[:/].*$/, '')
}
