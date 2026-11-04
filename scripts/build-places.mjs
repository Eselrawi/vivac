// Convierte data/raw/osm.json en catálogo compacto para la app + GeoJSON y CSV para revisar.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const osm = JSON.parse(readFileSync('data/raw/osm.json', 'utf8'))
const rows = []

const near = (a, b) => Math.hypot((a.lat - b.lat) * 111000, (a.lng - b.lng) * 84000)

for (const e of osm.elements) {
  const t = e.tags ?? {}
  const lat = e.lat ?? e.center?.lat
  const lng = e.lon ?? e.center?.lon
  if (lat == null) continue
  const name = t.name ?? t['name:es'] ?? null
  const ele = t.ele ? Math.round(parseFloat(t.ele)) : undefined
  const base = { id: `osm-${e.type[0]}${e.id}`, name, lat: +lat.toFixed(5), lng: +lng.toFixed(5), ele, source: `OpenStreetMap ${e.type}/${e.id}`, verified: false }
  const txt = `${name ?? ''}`.toLowerCase()
  let kind = null, shelter, extra = {}

  if (t.natural === 'peak') kind = 'cumbre'
  else if (t.amenity === 'drinking_water' || t.natural === 'spring') {
    kind = 'fuente'
    extra = { seasonal: t.seasonal ?? undefined, potable: t.drinking_water ?? undefined }
  } else if (t.amenity === 'parking') kind = 'parking'
  else if (t.tourism === 'alpine_hut' || t.tourism === 'hostel' || t.tourism === 'guest_house') {
    kind = /giner de los r/i.test(txt) || t.tourism === 'hostel' ? 'refugio_pago' : 'refugio_libre'; shelter = 'cerrado'
    extra = { fee: t.fee, web: t.website ?? t['contact:website'], phone: t.phone ?? t['contact:phone'], capacity: t.capacity }
  } else if (t.tourism === 'wilderness_hut' || t.building === 'hut') {
    kind = 'refugio_libre'; shelter = t.shelter_type === 'weather_shelter' ? 'techo' : 'cerrado'
    extra = { capacity: t.capacity, fireplace: t.fireplace }
  } else if (t.natural === 'cave_entrance') {
    kind = 'abrigo'; shelter = 'techo'
  } else if (t.amenity === 'shelter') {
    const st = t.shelter_type
    if (st === 'rock_shelter') { kind = 'abrigo'; shelter = 'techo' }
    else if (st === 'basic_hut' || st === 'lean_to' || st === 'weather_shelter' || st === 'picnic_shelter' || st === 'public_transport') {
      if (st === 'public_transport') continue
      kind = st === 'picnic_shelter' ? 'abrigo' : 'refugio_libre'
      shelter = st === 'basic_hut' ? 'cerrado' : 'techo'
    } else { kind = 'refugio_libre'; shelter = 'techo' }
  } else if (/parapeto/.test(txt)) { kind = 'parapeto'; shelter = 'parapeto' }
  else if (/chozo|majada|corral/.test(txt)) { kind = 'abrigo'; shelter = 'techo' }
  else if (/refugio/.test(txt)) { kind = 'refugio_libre'; shelter = 'cerrado' }
  if (!kind) continue
  if (kind === 'cumbre' && (!ele || ele < 1800)) continue
  if (kind === 'refugio_pago' && !((ele ?? 0) >= 1000 || /zabala|giner|palancar|cotos|fuenfr|vals|rascaf|navacerr|pedriza|cercedilla|canencia|barranca|penalara|peñalara/i.test(txt))) continue
  if (/majada|corral/.test(txt) && !t.amenity && !t.tourism && !t.building) extra = { ...extra, toponym: true }
  // Sin nombre: solo guardamos fuentes y refugios; el resto se descarta por ruido.
  rows.push({ ...base, kind, shelter, ...extra, name: name ?? (kind === 'fuente' ? 'Fuente' : kind === 'parking' ? 'Aparcamiento' : kind === 'parapeto' ? 'Parapeto sin nombre' : 'Sin nombre'), unnamed: !name })
}

// Duplicados: mismo tipo a menos de 25 m (o mismo nombre a menos de 150 m).
const out = []
for (const r of rows) {
  const d = out.find((o) => o.kind === r.kind && (near(o, r) < 25 || (!r.unnamed && o.name === r.name && near(o, r) < 150)))
  if (d) { d.source += ` + ${r.source}`; continue }
  out.push(r)
}

// Quitar claves vacías
for (const o of out) for (const k of Object.keys(o)) if (o[k] === undefined || o[k] === null) delete o[k]

const count = {}
out.forEach((o) => (count[o.kind] = (count[o.kind] ?? 0) + 1))
console.log(count, 'total', out.length)

mkdirSync('public/data', { recursive: true })
mkdirSync('data/review', { recursive: true })
writeFileSync('public/data/places.json', JSON.stringify(out))
writeFileSync('data/review/lugares.geojson', JSON.stringify({
  type: 'FeatureCollection',
  features: out.map((o) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [o.lng, o.lat] }, properties: o })),
}))
const cols = ['id', 'kind', 'name', 'lat', 'lng', 'ele', 'shelter', 'verified', 'source']
writeFileSync('data/review/lugares.csv', '﻿' + [cols.join(';'), ...out.map((o) => cols.map((c) => String(o[c] ?? '').replace(/;/g, ',')).join(';'))].join('\n'))
