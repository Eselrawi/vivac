// Listados públicos de refugios de otras webs (solo nombre, altitud y datos sueltos) para cruzarlos con nuestro catálogo.
import { writeFileSync } from 'node:fs'

const UA = { 'User-Agent': 'vivac-app/1.0 (https://github.com/Eselrawi/vivac; verificacion de refugios)' }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const get = async (u) => { for (let i = 0; i < 3; i++) { try { const r = await fetch(u, { headers: UA }); if (r.ok) return await r.text(); await sleep(2000) } catch { await sleep(2000) } } return '' }
const text = (h) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, '\n').replace(/&amp;/g, '&').replace(/\n\s*\n+/g, '\n')

const out = { walkaholic: [], mountain: [] }
for (const region of ['community-of-madrid/madrid', 'castile-and-leon/segovia', 'castile-and-leon/avila']) {
  const list = await get(`https://www.walkaholic.me/shelter/spain/${region}`)
  const links = [...new Set([...list.matchAll(/href="(https?:\/\/www\.walkaholic\.me)?(\/shelter\/spain\/[a-z-]+\/[a-z-]+\/[a-z-]+\/\d+-[a-z0-9-]+|\/shelter\/spain\/[a-z-]+\/[a-z-]+\/\d+-[a-z0-9-]+)"/g)].map((m) => m[2]))]
  for (const l of links) {
    const h = await get(`https://www.walkaholic.me${l}`)
    const t = text(h)
    const title = (h.match(/<title>([^<]+)<\/title>/)?.[1] ?? '').split('|')[0].trim()
    const beds = t.match(/(\d+) beds?/)?.[1]
    const ele = t.match(/\n(\d{3,4})\s?m\n/)?.[1]
    out.walkaholic.push({ name: title.replace(/^Shelter\s*-\s*/i, ''), url: `https://www.walkaholic.me${l}`, beds: beds ? +beds : null, free: /Free to use/i.test(t), ele: ele ? +ele : null, region })
    await sleep(500)
  }
  console.log('walkaholic', region, links.length)
}
const mf = await get('https://www.mountain-forecast.com/subranges/sierra-de-guadarrama/locations')
for (const m of mf.matchAll(/href="\/huts-and-lodges\/([A-Za-z0-9-]+)\/forecasts\/(\d+)">([^<]+)<\/a>/g)) out.mountain.push({ name: m[3].trim(), url: `https://www.mountain-forecast.com/huts-and-lodges/${m[1]}`, ele: +m[2] })
console.log('mountain-forecast', out.mountain.length)
writeFileSync('data/raw/web-lists.json', JSON.stringify(out, null, 1))
console.log(out.walkaholic.length, 'walkaholic;', out.walkaholic.slice(0, 5).map((x) => `${x.name}/${x.ele}/${x.beds}`).join(' | '))
