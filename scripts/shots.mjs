import { chromium, devices } from 'playwright'
import { mkdirSync } from 'node:fs'

const url = process.argv[2] ?? 'http://localhost:4173/'
const out = 'screenshots'
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
for (const [name, dev] of [['iphone15', devices['iPhone 15']], ['pixel', devices['Pixel 7']]]) {
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ ...dev, colorScheme: scheme, locale: 'es-ES', timezoneId: 'Europe/Madrid', geolocation: { latitude: 40.82, longitude: -3.96 }, permissions: ['geolocation'] })
    const page = await ctx.newPage()
    page.on('pageerror', (e) => console.log('ERR', name, scheme, e.message.slice(0, 160)))
    await page.addInitScript(() => localStorage.setItem('vivac.welcome', '1'))
    await page.goto(url, { waitUntil: 'load' })
    await page.waitForTimeout(6000)
    const shot = (n) => page.screenshot({ path: `${out}/${name}-${scheme}-${n}.png` })
    await shot('dormir')
    // ficha del mejor sitio
    await page.locator('button:has-text("Ver y planear")').first().click({ timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(2500)
    await shot('ficha')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(800)
    for (const tab of ['Mapa', 'Diario', 'Mochila']) {
      await page.getByRole('button', { name: tab, exact: true }).click({ timeout: 5000 }).catch(() => {})
      await page.waitForTimeout(tab === 'Mapa' ? 12000 : 1500)
      await shot(tab.toLowerCase())
    }
    await ctx.close()
  }
}
await browser.close()
console.log('capturas listas')
