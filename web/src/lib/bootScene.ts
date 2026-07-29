// Boot oscuro por hash (issue #982): mientras el bundle carga, un script inline
// en `index.html` decide si el DESTINO del deep link es una escena oscura
// (`#g=…`, viaje/reto — TripPage/PlayChallenge, ambas sobre --scene-bg) y, si lo
// es, añade la clase `boot-scene` a `<html>` ANTES de que exista React: sin eso,
// la primera pintura (HTML crudo) usa el papel por defecto de `body` y se ve un
// flash claro justo antes de que la app monte con su propio fondo de escena.
//
// Ese script inline NO puede importar este módulo (corre antes de que el bundle
// exista), así que el criterio vive DUPLICADO ahí — si tocas la regex, actualiza
// también la copia en `index.html`. Aquí vive la versión TypeScript que usa
// `BootScreen` (App.tsx) para pintar su propio fondo oscuro equivalente mientras
// dura el arranque, y la función que retira la clase en cuanto React monta.

export const BOOT_SCENE_CLASS = 'boot-scene'

/** ¿El hash apunta a una escena OSCURA (deep link de viaje/reto, `#g=…`)? */
export function isDarkSceneHash(hash: string): boolean {
  return /(^|[#&])g=/.test(hash)
}

/**
 * Retira la clase de arranque oscuro de `<html>` (App.tsx, al montar). No-op si
 * no estaba puesta (arranque sin deep link oscuro, o ya retirada). Se llama una
 * única vez, en el primer commit de React — para entonces `BootScreen` ya pinta
 * su propio fondo oscuro equivalente si el destino lo pedía, así la retirada no
 * produce un flash de vuelta a papel.
 */
export function clearBootScene(): void {
  document.documentElement.classList.remove(BOOT_SCENE_CLASS)
}
