import { defineConfig } from 'vitest/config'

// Config de tests separada de vite.config.ts para evitar el choque de tipos
// entre Vite 8 (rolldown) y la copia de Vite que trae Vitest.
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    // Env dummy para los tests: el cliente de Supabase (supabase.ts) lanza al
    // importarse si faltan estas variables, y varios módulos lo arrastran. En
    // CI no hay .env.local, así que sin esto cualquier test que importe supabase
    // (p.ej. mapsUrl.test.ts) revienta. No son credenciales reales: los tests no
    // tocan backend; en dev/prod mandan las VITE_* reales.
    env: {
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
    },
    // Los smoke E2E (e2e/*.spec.ts) corren con Playwright, no con Vitest.
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
})
