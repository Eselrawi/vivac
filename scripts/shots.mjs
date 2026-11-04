import { chromium, devices } from 'playwright'
import { mkdirSync } from 'node:fs'

const url = process.argv[2] ?? 'http://localhost:4173/'
const out = 'screenshots'
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] })
for (const [name, dev] of [['iphone15', devices['iPhone 15']], ['pixel8', devices['Pixel 7']]]) {
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ ...dev, colorScheme: scheme, locale: 'es-ES' })
    const page = await ctx.newPage()
    await page.goto(url, { waitUntil: 'load' })
    await page.evaluate((s) => document.documentElement.setAttribute('data-theme', s === 'dark' ? 'dark' : 'light'), scheme)
    await page.waitForTimeout(500)
    for (const tab of ['Dormir', 'Mapa', 'Diario', 'Mochila']) {
      await page.getByRole('button', { name: tab, exact: true }).click()
      await page.waitForTimeout(tab === 'Mapa' ? 6000 : 500)
      await page.screenshot({ path: `${out}/${name}-${scheme}-${tab.toLowerCase()}.png` })
    }
    await ctx.close()
  }
}
await browser.close()
console.log('capturas listas')
