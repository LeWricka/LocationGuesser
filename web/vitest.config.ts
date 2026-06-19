import { defineConfig } from 'vitest/config'

// Config de tests separada de vite.config.ts para evitar el choque de tipos
// entre Vite 8 (rolldown) y la copia de Vite que trae Vitest.
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
})
