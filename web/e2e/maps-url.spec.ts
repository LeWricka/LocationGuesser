import { test, expect } from '@playwright/test'

// E2E del campo "Pega un enlace de Google Maps" (issue #14).
//
// Cubrimos SOLO el camino que NO necesita red: una URL LARGA de Maps se resuelve
// con el parser local (parseLatLngFromText) → debe aparecer el badge "Punto marcado".
// El enlace CORTO (maps.app.goo.gl) pasa por la Edge Function y requiere red real;
// queda fuera de este test determinista (se valida en el flujo manual / prod).

test.describe('pegar enlace de Maps', () => {
  test('URL larga → punto marcado (sin red)', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Crear un reto' }).click()
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
