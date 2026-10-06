import { defineConfig } from 'vitest/config'

export default defineConfig({
  define: {
    __API_BASE__: JSON.stringify('http://api.test'),
    __DEV__: 'false',
  },
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  test: {
    include: ['test/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
})
