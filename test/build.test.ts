import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('build', () => {
  it('inlines the UI bundle into dist/ui.html', () => {
    execFileSync('node', ['scripts/build.mjs', '--mode', 'dev'], { stdio: 'pipe' })
    const html = readFileSync('dist/ui.html', 'utf8')
    expect(html).toContain('<style>')
    expect(html).toContain('<script>')
    expect(html).not.toContain('INLINE_')
    expect(html).toContain('http://localhost:9001')
    expect(html).toContain('http://localhost:9002')
  })

  it('accepts the dev environment only in dev builds', () => {
    const env = { ...process.env, OGEN_API_URL: 'https://api.dev.getogen.com' }
    execFileSync('node', ['scripts/build.mjs', '--mode', 'dev'], { stdio: 'pipe', env })
    expect(readFileSync('dist/ui.html', 'utf8')).toContain('https://api.dev.getogen.com')
    expect(() => execFileSync('node', ['scripts/build.mjs', '--mode', 'prod'], { stdio: 'pipe', env })).toThrow(
      /not in manifest\.json networkAccess/,
    )
  })

  it('takes the origin from --api', () => {
    execFileSync('node', ['scripts/build.mjs', '--mode', 'dev', '--api', 'https://api.dev.getogen.com'], { stdio: 'pipe' })
    const html = readFileSync('dist/ui.html', 'utf8')
    expect(html).toContain('https://api.dev.getogen.com')
    expect(html).toContain('https://app.dev.getogen.com')
  })

  it('takes the app origin from --app', () => {
    execFileSync('node', ['scripts/build.mjs', '--mode', 'dev', '--app', 'http://localhost:9005'], { stdio: 'pipe' })
    expect(readFileSync('dist/ui.html', 'utf8')).toContain('http://localhost:9005')
  })

  it('refuses an API origin missing from the manifest', () => {
    expect(() =>
      execFileSync('node', ['scripts/build.mjs', '--mode', 'prod'], {
        stdio: 'pipe',
        env: { ...process.env, OGEN_API_URL: 'https://evil.example' },
      }),
    ).toThrow(/not in manifest\.json networkAccess/)
  })

  it('lets video uploads reach Ogen storage, with a reason for reviewers', () => {
    const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'))
    expect(manifest.networkAccess.allowedDomains).toEqual(['https://api.getogen.com', 'https://assets.getogen.com'])
    expect(manifest.networkAccess.devAllowedDomains).toContain('https://*.r2.cloudflarestorage.com')
    expect(manifest.networkAccess.reasoning).toMatch(/video/)
  })
})

describe('verify-release', () => {
  // verify runs the verifier and returns its stderr, failing the test on
  // anything but a clean pass or the verifier's own report.
  const verify = (...args: string[]) => {
    const { status, stderr } = spawnSync('node', ['scripts/verify-release.mjs', ...args], { encoding: 'utf8' })
    if (status === 0) return ''
    expect(status).toBe(1)
    expect(stderr).toMatch(/^\[verify\] not a publishable production build:\n/)
    return stderr
  }

  // release copies a prod build into a temp dir, with manifest changes.
  const release = (edit: (manifest: Record<string, any>) => void) => {
    execFileSync('node', ['scripts/build.mjs', '--mode', 'prod'], { stdio: 'pipe' })
    const dir = mkdtempSync(join(tmpdir(), 'ogen-release-'))
    cpSync('dist', join(dir, 'dist'), { recursive: true })
    const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'))
    manifest.id = '1234567890'
    edit(manifest)
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest))
    return dir
  }

  it('rejects a dev build', () => {
    execFileSync('node', ['scripts/build.mjs', '--mode', 'dev'], { stdio: 'pipe' })
    const out = verify()
    expect(out).toContain('does not call the production API')
    expect(out).toContain('development origin localhost')
    expect(out).toContain('spike readout')
  })

  it('passes a prod build, short of the real plugin id until it is set', () => {
    execFileSync('node', ['scripts/build.mjs', '--mode', 'prod'], { stdio: 'pipe' })
    const { version } = JSON.parse(readFileSync('package.json', 'utf8'))
    const out = verify('--tag', `v${version}`)
    if (out !== '') {
      expect(out.trim().split('\n').slice(1)).toEqual([expect.stringContaining('is not a real Figma plugin id')])
    }
  })

  it('passes a prod build with a real plugin id', () => {
    expect(verify('--dir', release(() => {}))).toBe('')
  })

  it('rejects any allowedDomains entry beyond the production origins', () => {
    for (const extra of ['https://staging.getogen.com', 'https://*.getogen.com', 'https://*.r2.cloudflarestorage.com']) {
      const dir = release((m) => m.networkAccess.allowedDomains.push(extra))
      expect(verify('--dir', dir)).toContain(`${extra} is not an approved production origin`)
    }
  })

  it('rejects allowedDomains missing a production origin', () => {
    const dir = release((m) => (m.networkAccess.allowedDomains = ['https://api.getogen.com']))
    expect(verify('--dir', dir)).toContain('allowedDomains is missing https://assets.getogen.com')
  })

  it('rejects a tag that is not the package version', () => {
    execFileSync('node', ['scripts/build.mjs', '--mode', 'prod'], { stdio: 'pipe' })
    expect(verify('--tag', 'v0.0.0-nope')).toContain('does not match package.json version')
  })
})
