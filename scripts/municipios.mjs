// Municipios (límites administrativos de OSM) para decir en qué término está cada sitio, sin pedirlo uno a uno.
import { writeFileSync } from 'node:fs'
const q = '[out:json][timeout:240];rel["boundary"="administrative"]["admin_level"="8"](40.50,-4.50,41.10,-3.60);out geom;'
let j
for (let i = 0; i < 6 && !j; i++) {
  for (const m of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']) {
    try { const r = await fetch(m, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'User-Agent': 'vivac-app/1.0' } }); if (r.ok) { j = await r.json(); break } } catch {}
  }
  if (!j) await new Promise((r) => setTimeout(r, 15000))
}
if (!j) throw new Error('sin datos')
const out = j.elements.map((e) => ({
  name: e.tags.name, prov: e.tags['is_in:province'] ?? null,
  rings: (e.members ?? []).filter((m) => m.type === 'way' && m.geometry && m.role !== 'inner').map((m) => m.geometry.map((p) => [p.lon, p.lat])),
}))
writeFileSync('data/raw/municipios.json', JSON.stringify(out))
console.log('municipios', out.length, out.slice(0, 5).map((m) => m.name).join(', '))
