// Amplía el catálogo con sitios cubiertos (búnkeres, casetas, chozos, cuevas, ermitas) y separa los falsos refugios.
import { readFileSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'

const places = JSON.parse(readFileSync('public/data/places.json', 'utf8'))
const osm2 = JSON.parse(readFileSync('data/raw/osm2.json', 'utf8')).elements
const settle = JSON.parse(readFileSync('data/raw/settlements.json', 'utf8'))
const norm = (s) => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const M = 111320
const dist = (a, b) => Math.hypot((a.lat - b.lat) * M, (a.lng - b.lng) * M * Math.cos((a.lat * Math.PI) / 180))

// ---- Altitud (modelo de elevación) para filtrar lo que está en el llano ----
const Z = 12, N = 2 ** Z, tiles = new Map()
async function tile(x, y) {
  const k = `${x}/${y}`
  if (!tiles.has(k)) {
    try {
      const r = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${x}/${y}.png`)
      const { data, info } = await sharp(Buffer.from(await r.arrayBuffer())).removeAlpha().raw().toBuffer({ resolveWithObject: true })
      tiles.set(k, { data, w: info.width })
    } catch { tiles.set(k, null) }
  }
  return tiles.get(k)
}
async function elev(lat, lng) {
  const fx = ((lng + 180) / 360) * N, rad = (lat * Math.PI) / 180
  const fy = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * N
  const t = await tile(Math.floor(fx), Math.floor(fy))
  if (!t) return null
  const i = (Math.min(255, Math.floor((fy % 1) * 256)) * t.w + Math.min(255, Math.floor((fx % 1) * 256))) * 3
  return Math.round(t.data[i] * 256 + t.data[i + 1] + t.data[i + 2] / 256 - 32768)
}

// ---- Falsos refugios: no son sitios para dormir ----
const BAD_NAME = /hospital|reten|cuartel|guarderia|hotel|restaurante|venta |casa rural|apartamento|camping|albergue de peregrinos|animales|perrera|protectora|veterinari|autobus|parada|marquesina|cementerio|iglesia de|colegio|escuela|ayuntamiento|oficina|centro de|aula |museo/
const BAD_TAG = (t) => t.access === 'private' || t.access === 'no' || t.amenity === 'animal_shelter' || t.amenity === 'bus_station' || !!t.public_transport || t.shelter_type === 'public_transport' || t.amenity === 'hospital' || t.amenity === 'police' || t.tourism === 'hotel' || t.tourism === 'camp_site'
const desc = []
const discard = (p, why, src) => desc.push({ id: p.id, name: p.name, kind: p.kind, lat: p.lat, lng: p.lng, ele: p.ele ?? null, motivo: why, fuente: src })

// Limpia el catálogo actual
const keep = []
for (const p of places) {
  const n = norm(p.name)
  if (['refugio_libre', 'abrigo'].includes(p.kind) && (BAD_NAME.test(n) || /casa forestal/.test(n))) {
    discard(p, /casa forestal/.test(n) ? 'Casa forestal: suele estar cerrada o ser de uso de guardas' : /reten/.test(n) ? 'Retén de guardas forestales: no es refugio de uso libre' : /hospital/.test(n) ? 'Antiguo hospital o edificio no destinado a refugio' : 'No es un refugio de uso libre', p.source)
    continue
  }
  keep.push(p)
}

// ---- Clasificación de los nuevos ----
const RX = {
  bunker: /fortin|nido de|bunker|casamata|pillbox|blocao/,
  cueva: /cueva|covacha|covachuela|gruta|abrigo|cova( |$)/,
  chozo: /chozo|choza|aprisco|majada|corral|tenada|cercado|zahurd|navazo/,
  caseta: /caseta|casilla|cabana|caseton|casa del guarda|refugio|pajar|caseron/,
  ermita: /ermita|capilla/,
}
const near = (e, list, r) => list.some((q) => dist(e, q) <= r)
const existing = keep.filter((p) => ['refugio_libre', 'refugio_pago', 'parapeto', 'abrigo', 'bunker'].includes(p.kind))
const added = []
let skippedLow = 0, skippedNear = 0, skippedSettle = 0
for (const e of osm2) {
  const t = e.tags ?? {}
  const lat = e.lat ?? e.center?.lat, lng = e.lon ?? e.center?.lon
  if (lat == null) continue
  const id = `osm-${e.type[0]}${e.id}`
  if (places.some((p) => p.source.includes(`${e.type}/${e.id}`))) continue
  const name = t.name ?? null
  const n = norm(name)
  const base = { id, name: name ?? '', lat: +lat.toFixed(5), lng: +lng.toFixed(5), verified: false, source: `OpenStreetMap ${e.type}/${e.id}`, unnamed: !name }
  if (BAD_TAG(t) || (name && BAD_NAME.test(n))) { discard({ ...base, name: name ?? 'Sin nombre', kind: 'refugio_libre' }, BAD_TAG(t) ? 'Privado, de uso público distinto o no es refugio' : 'Edificio que no es un refugio de uso libre', base.source); continue }

  let sub = null, kind = 'refugio_libre', shelter = 'cerrado'
  if (t.military === 'bunker' || t.building === 'bunker' || t.historic === 'bunker' || t.military === 'pillbox' || RX.bunker.test(n) || t.historic === 'fort' || t.military === 'fort') { sub = 'bunker'; kind = 'bunker'; shelter = 'techo' }
  else if (t.natural === 'cave_entrance' || RX.cueva.test(n)) { sub = 'cueva'; kind = 'abrigo'; shelter = 'techo' }
  else if (t.amenity === 'place_of_worship' || RX.ermita.test(n)) { sub = 'ermita'; shelter = 'techo' }
  else if (t.building === 'ruins' || t.ruins === 'yes' || t.historic === 'ruins' || t.disused === 'yes') { sub = 'ruina'; kind = 'abrigo'; shelter = 'techo' }
  else if (RX.chozo.test(n) || t.building === 'barn' || t.building === 'farm_auxiliary') { sub = 'chozo' }
  else if (RX.caseta.test(n) || ['cabin', 'hut', 'shed', 'shelter', 'hunting_lodge', 'service'].includes(t.building ?? '')) { sub = 'caseta' }
  else continue
  if (sub === 'ermita' && !(name && RX.ermita.test(n))) continue

  const ele = await elev(base.lat, base.lng)
  if (ele == null || ele < (name ? 950 : 1150)) { skippedLow++; continue }
  const sd = Math.min(...settle.filter((s) => s.place !== 'isolated_dwelling').map((s) => dist(base, s)))
  const keyword = name && (RX.bunker.test(n) || RX.cueva.test(n) || RX.chozo.test(n) || RX.caseta.test(n))
  if (!keyword && sd < 1500) { skippedSettle++; continue }
  if (near(base, existing, 35) || near(base, added, 35)) { skippedNear++; continue }
  const rec = { ...base, ele, kind, shelter, sub, name: name ?? ({ bunker: 'Búnker o fortín sin nombre', cueva: 'Cueva o abrigo sin nombre', ermita: 'Ermita', ruina: 'Ruina sin nombre', chozo: 'Construcción de pastores sin nombre', caseta: 'Caseta sin nombre' })[sub] }
  const tg = {}
  for (const k of ['building', 'roof', 'access', 'operator', 'description', 'description:es', 'start_date', 'ruins', 'disused', 'fireplace', 'capacity', 'image', 'wikimedia_commons', 'wikidata', 'website']) if (t[k]) tg[k] = t[k]
  if (Object.keys(tg).length) rec.osm = tg
  if (sub === 'ruina') rec.ruin = true
  added.push(rec)
}
const out = [...keep, ...added]
writeFileSync('public/data/places.json', JSON.stringify(out))
writeFileSync('public/data/descartados.json', JSON.stringify(desc))
writeFileSync('data/review/descartados.csv', '﻿' + ['id;nombre;tipo;lat;lng;altitud;motivo;fuente', ...desc.map((d) => [d.id, d.name, d.kind, d.lat, d.lng, d.ele ?? '', d.motivo, d.fuente].map((x) => String(x).replace(/;/g, ',')).join(';'))].join('\n'))
const by = {}
for (const a of added) by[a.sub] = (by[a.sub] ?? 0) + 1
console.log('añadidos', added.length, by, '| descartados', desc.length, '| saltados: bajos', skippedLow, 'cerca de pueblos', skippedSettle, 'duplicados', skippedNear)
