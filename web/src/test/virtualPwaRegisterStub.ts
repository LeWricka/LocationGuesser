// Stub de `virtual:pwa-register` (módulo virtual que provee vite-plugin-pwa en
// build, ver vite.config.ts) para que Vitest pueda RESOLVER el import de
// `main.tsx` en tests (#647): sin este alias, `import 'virtual:pwa-register'`
// falla en el paso de análisis de imports de Vite antes de que `vi.mock`
// tenga ocasión de interceptarlo. Solo se usa en tests (alias en
// vitest.config.ts); el build real sigue resolviendo el módulo virtual de
// verdad. Los tests que necesitan controlar `onNeedRefresh`/`updateSW`
// sustituyen este módulo con `vi.mock('virtual:pwa-register', …)`.
export function registerSW(): (reloadPage?: boolean) => Promise<void> {
  return async () => {}
}
