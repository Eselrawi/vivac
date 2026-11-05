import { chromium, devices } from 'playwright'

const url = process.argv[2] ?? 'http://localhost:4173/'
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const ctx = await browser.newContext({ ...devices['iPhone 15'], locale: 'es-ES', serviceWorkers: 'allow' })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('ERR', e.message.slice(0, 200)))
await page.addInitScript(() => localStorage.setItem('vivac.welcome', '1'))
await page.goto(url, { waitUntil: 'load' })
await page.waitForTimeout(12000) // SW instala, llega la previsión y se guarda
console.log('SW activo:', await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.active))

await ctx.setOffline(true)
await page.reload({ waitUntil: 'load' })
await page.waitForTimeout(6000)
const title = await page.locator('h1').first().textContent()
const hero = await page.locator('text=La mejor noche para').count()
console.log('Sin red → título:', title, '| hay tarjeta de mejor noche:', hero > 0)
await page.screenshot({ path: 'screenshots/offline-dormir.png' })

// Mochila y Diario sin red
for (const tab of ['Mochila', 'Diario']) {
  await page.getByRole('button', { name: tab, exact: true }).click()
  await page.waitForTimeout(1500)
  console.log(tab, '→', (await page.locator('h1').first().textContent()))
}
// Guardar un vivac sin red
await ctx.grantPermissions(['geolocation'])
await ctx.setGeolocation({ latitude: 40.82, longitude: -3.96 })
await page.getByRole('button', { name: 'Dormir', exact: true }).click()
await page.waitForTimeout(800)
await page.getByRole('button', { name: 'Añadir', exact: true }).click()
await page.getByText('Dormimos aquí', { exact: true }).first().click()
await page.waitForTimeout(2500)
await page.getByPlaceholder('Nombre del sitio').fill('Prueba sin cobertura')
await page.getByRole('button', { name: 'Guardar', exact: true }).click()
await page.waitForTimeout(1800)
await page.getByRole('button', { name: 'Diario', exact: true }).click()
await page.waitForTimeout(1500)
console.log('Diario tras guardar sin red contiene el vivac:', (await page.locator('text=Prueba sin cobertura').count()) > 0)
await page.screenshot({ path: 'screenshots/offline-diario.png' })
await browser.close()
