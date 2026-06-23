import { test, expect, hasAuthCreds } from './helpers/authed'

// E2E AUTENTICADO del campo "Pega un enlace de Google Maps" (issue #14, adaptado a
// login en #140). Cubrimos SOLO el camino que NO necesita red: una URL LARGA de
// Maps se resuelve con el parser local (parseLatLngFromText) → badge "Punto marcado".
// El enlace CORTO (maps.app.goo.gl) pasa por la Edge Function y requiere red real;
// queda fuera de este test determinista.
//
// Necesita sesión para llegar al formulario de crear reto (grupo-primero), así que
// se SALTA sin credenciales (E2E_USER_EMAIL/PASSWORD). Crear el grupo es un insert
// ligero throwaway.

test.skip(!hasAuthCreds, 'Define E2E_USER_EMAIL/E2E_USER_PASSWORD para los E2E autenticados')

test.describe('pegar enlace de Maps (autenticado)', () => {
  test('URL larga → punto marcado (sin red)', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Crear grupo' }).click()
    await expect(page.getByRole('heading', { name: 'Crear un grupo' })).toBeVisible({
      timeout: 20_000,
    })

    const groupName = `mapsurl-${Date.now().toString(36)}`
    await page.getByRole('textbox', { name: 'Nombre del grupo' }).fill(groupName)
    await page.getByRole('button', { name: 'Crear grupo' }).click()

    await expect(page.getByRole('heading', { name: groupName })).toBeVisible({ timeout: 20_000 })
    await page.getByRole('button', { name: '➕ Añadir reto' }).first().click()
    await expect(page.getByRole('heading', { name: 'Crear un reto' })).toBeVisible()

    // Pegamos una URL larga con coordenadas embebidas (@lat,lng). El parser local
    // la resuelve al instante, sin tocar la Edge Function.
    const linkBox = page.getByRole('textbox', { name: 'Pega un enlace de Google Maps' })
    await linkBox.fill('https://www.google.com/maps/@40.4168,-3.7038,15z')
    await page.getByRole('button', { name: 'Usar enlace' }).click()

    await expect(page.getByText('Punto marcado')).toBeVisible()
    await expect(page.getByText('40.41680, -3.70380')).toBeVisible()
  })
})
