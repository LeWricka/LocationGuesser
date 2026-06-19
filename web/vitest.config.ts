import { defineConfig } from 'vitest/config'

// Config de tests separada de vite.config.ts para evitar el choque de tipos
// entre Vite 8 (rolldown) y la copia de Vite que trae Vitest.
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    // Los smoke E2E (e2e/*.spec.ts) corren con Playwright, no con Vitest.
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
})
