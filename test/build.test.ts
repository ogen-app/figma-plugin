import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('build', () => {
  it('inlines the UI bundle into dist/ui.html', () => {
    execFileSync('node', ['scripts/build.mjs', '--mode', 'dev'], { stdio: 'pipe' })
    const html = readFileSync('dist/ui.html', 'utf8')
    expect(html).toContain('<style>')
    expect(html).toContain('<script>')
    expect(html).not.toContain('INLINE_')
    expect(html).toContain('http://localhost:9001')
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
    expect(readFileSync('dist/ui.html', 'utf8')).toContain('https://api.dev.getogen.com')
  })

  it('refuses an API origin missing from the manifest', () => {
    expect(() =>
      execFileSync('node', ['scripts/build.mjs', '--mode', 'prod'], {
        stdio: 'pipe',
        env: { ...process.env, OGEN_API_URL: 'https://evil.example' },
      }),
    ).toThrow(/not in manifest\.json networkAccess/)
  })
})
