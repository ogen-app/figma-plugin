// The Ogen API origin each build mode targets by default. build.mjs compiles
// it into the bundle; verify-release.mjs checks a production bundle against it.
export const DEFAULT_API = {
  dev: 'http://localhost:9001',
  prod: 'https://api.getogen.com',
}
