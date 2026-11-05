// Refugios que figuran en Walkaholic o Mountain Forecast y que no están en nuestro catálogo: se buscan por nombre (Nominatim, solo dentro de la sierra).
import { readFileSync, writeFileSync } from 'node:fs'

const UA = { 'User-Agent': 'vivac-app/1.0 (https://github.com/Eselrawi/vivac; contraste de refugios)' }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const places = JSON.parse(readFileSync('public/data/places.json', 'utf8'))
const lists = JSON.parse(readFileSync('data/raw/web-lists.json', 'utf8'))
const norm = (x) => (x ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const GENERIC = new Set(['refugio', 'chozo', 'choza', 'vivac', 'cueva', 'del', 'de', 'la', 'las', 'los', 'el', 'libre', 'shelter', 'hut', 'caseta'])
const key = (n) => norm(n).split(/[^a-z0-9]+/).filter((t) => t && !GENERIC.has(t)).join('')
const M = 111320
const dist = (a, b) => Math.hypot((a.lat - b.lat) * M, (a.lng - b.lng) * M * Math.cos((a.lat * Math.PI) / 180))
const BBOX = { s: 40.5, w: -4.5, n: 41.1, e: -3.6 }

const have = (name, ele) => places.some((p) => ['refugio_libre', 'refugio_pago', 'parapeto', 'abrigo', 'bunker'].includes(p.kind) && (() => { const a = key(p.name), b = key(name); return a.length >= 5 && b.length >= 5 && (a === b || a.includes(b) || b.includes(a)) && (ele == null || p.ele == null || Math.abs(p.ele - ele) <= 120) })())
const todo = []
for (const w of lists.walkaholic) if (!have(w.name, w.ele)) todo.push({ ...w, site: 'Walkaholic' })
for (const m of lists.mountain) if (!/peak|mount/i.test(m.name) && !have(m.name, m.ele)) todo.push({ ...m, site: 'Mountain Forecast' })
console.log('por buscar:', todo.length)

const found = []
for (const t of todo) {
  const q = t.name.replace(/^Refugio\s+/i, 'Refugio ').replace(/\b([A-ZÁÉÍÓÚÑ]{3,})\b/g, (m) => m.charAt(0) + m.slice(1).toLowerCase())
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&limit=3&viewbox=${BBOX.w},${BBOX.n},${BBOX.e},${BBOX.s}&bounded=1&accept-language=es`
  try {
    const r = await fetch(url, { headers: UA })
    const j = r.ok ? await r.json() : []
    const hit = j.find((x) => ['building', 'amenity', 'tourism', 'shelter', 'historic', 'man_made', 'natural'].includes(x.category) || /refugio|chozo|cabana|caseta/.test(norm(x.display_name)))
    if (hit) found.push({ name: t.name.replace(/\b([A-ZÁÉÍÓÚÑ]{3,})\b/g, (m) => m.charAt(0) + m.slice(1).toLowerCase()), lat: +(+hit.lat).toFixed(5), lng: +(+hit.lon).toFixed(5), ele: t.ele ?? null, site: t.site, url: t.url, beds: t.beds ?? null, free: !!t.free, osm: `${hit.osm_type}/${hit.osm_id}` })
  } catch {}
  await sleep(1200)
}
console.log('localizados:', found.length)
const nuevos = []
for (const f of found) {
  if (places.some((p) => dist(p, f) < 60)) continue
  nuevos.push({
    id: `ext-${key(f.name)}`, name: f.name, kind: 'refugio_libre', shelter: 'cerrado', sub: 'caseta', lat: f.lat, lng: f.lng, ele: f.ele ?? undefined,
    verified: false, source: `${f.site} (${f.url}) + OpenStreetMap ${f.osm}`, ext: { site: f.site, url: f.url, beds: f.beds, free: f.free },
  })
}
writeFileSync('data/raw/external-new.json', JSON.stringify(nuevos, null, 1))
console.log('nuevos para el catálogo:', nuevos.length, nuevos.map((n) => n.name).join(' | '))
