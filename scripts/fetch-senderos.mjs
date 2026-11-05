// Senderos señalizados (GR, PR, SL y otras rutas a pie) con su código y color → public/data/senderos.geojson
import { writeFileSync } from 'node:fs'

const BB = '40.50,-4.50,41.10,-3.60'
const Q = `[out:json][timeout:300];
rel["route"="hiking"]["network"~"^(lwn|rwn|nwn|iwn)$"](${BB});
out geom;`
async function go(q) {
  for (let i = 0; i < 8; i++) {
    for (const m of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']) {
      try { const r = await fetch(m, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'User-Agent': 'vivac-app/1.0' } }); if (r.ok) return await r.json() } catch {}
    }
    await new Promise((r) => setTimeout(r, 15000))
  }
  throw new Error('Overpass no responde')
}
const j = await go(Q)
const kindOf = (t) => {
  const ref = (t.ref ?? '').toUpperCase()
  if (/^GR[ -]?[0-9]/.test(ref) || t.network === 'nwn' || t.network === 'iwn') return 'GR'
  if (/^PR/.test(ref) || t.network === 'rwn') return 'PR'
  if (/^SL/.test(ref) || t.network === 'lwn') return 'SL'
  return 'otro'
}
const dp = (pts, tol) => {
  if (pts.length < 3) return pts
  const [a, b] = [pts[0], pts[pts.length - 1]]
  let md = 0, mi = 0
  const k = Math.cos((a[1] * Math.PI) / 180) * 111320
  for (let i = 1; i < pts.length - 1; i++) {
    const px = (pts[i][0] - a[0]) * k, py = (pts[i][1] - a[1]) * 111320, bx = (b[0] - a[0]) * k, by = (b[1] - a[1]) * 111320
    const l2 = bx * bx + by * by, t = l2 ? Math.max(0, Math.min(1, (px * bx + py * by) / l2)) : 0
    const d = Math.hypot(px - t * bx, py - t * by)
    if (d > md) { md = d; mi = i }
  }
  return md <= tol ? [a, b] : [...dp(pts.slice(0, mi + 1), tol).slice(0, -1), ...dp(pts.slice(mi), tol)]
}
const features = []
const seen = new Set()
let rels = 0
for (const r of j.elements) {
  const t = r.tags ?? {}
  const kind = kindOf(t)
  if (kind === 'otro') continue
  rels++
  const ref = (t.ref ?? t.name ?? '').replace(/\s+/g, ' ').trim()
  for (const m of r.members ?? []) {
    if (m.type !== 'way' || !m.geometry || m.geometry.length < 2) continue
    const id = `${m.ref}-${ref}`
    if (seen.has(id)) continue
    seen.add(id)
    const coords = dp(m.geometry.map((p) => [+p.lon.toFixed(5), +p.lat.toFixed(5)]), 4)
    const mm = /^(GR|PR|SL)[ -]?([A-Z]{0,3})[ -]?([0-9]+[A-Za-z]?)/i.exec(ref)
    const code = mm ? `${mm[1].toUpperCase()}${mm[2] ? '-' + mm[2].toUpperCase() : ''} ${mm[3]}` : ''
    features.push({ type: 'Feature', properties: { ref, code, kind, name: t.name ?? ref }, geometry: { type: 'LineString', coordinates: coords } })
  }
}
const fc = { type: 'FeatureCollection', features }
writeFileSync('public/data/senderos.geojson', JSON.stringify(fc))
const byKind = {}
for (const f of features) byKind[f.properties.kind] = (byKind[f.properties.kind] ?? 0) + 1
console.log('relaciones', rels, 'tramos', features.length, byKind, 'KB', Math.round(JSON.stringify(fc).length / 1024), 'códigos', [...new Set(features.map((f) => f.properties.ref))].slice(0, 12).join(', '))
