import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Config de tests separada de vite.config.ts para evitar el choque de tipos
// entre Vite 8 (rolldown) y la copia de Vite que trae Vitest.
export default defineConfig({
  resolve: {
    alias: {
      // `virtual:pwa-register` lo provee vite-plugin-pwa (solo en build real,
      // ver vite.config.ts); aquí no hay plugin que lo resuelva, así que sin
      // este alias `main.test.ts` (#647) no puede ni importar `main.tsx`. Los
      // tests sustituyen el stub con `vi.mock('virtual:pwa-register', …)`.
      'virtual:pwa-register': fileURLToPath(
        new URL('./src/test/virtualPwaRegisterStub.ts', import.meta.url),
      ),
    },
  },
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
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Umbrales como SUELO (ratchet), no como meta: puestos un par de puntos por
      // debajo de la cobertura ACTUAL (~30% líneas, ~86% ramas, ~72% funciones)
      // para que CI NO falle hoy pero SÍ atrape una regresión que baje la barra.
      // Súbelos con el tiempo a medida que aumente la cobertura real; no los pongas
      // aspiracionales (romperían el build sin aportar). Reportes: --coverage.
      thresholds: {
        lines: 28,
        statements: 28,
        functions: 68,
        branches: 82,
      },
    },
  },
})
