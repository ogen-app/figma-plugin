// The Ogen API origin each build mode targets by default. build.mjs compiles
// it into the bundle; verify-release.mjs checks a production bundle against it.
export const DEFAULT_API = {
  dev: 'http://localhost:9001',
  prod: 'https://api.getogen.com',
}

// PROD_DOMAINS is exactly what a published manifest's allowedDomains may
// hold: the API and Ogen's storage.
export const PROD_DOMAINS = [DEFAULT_API.prod, 'https://assets.getogen.com']
