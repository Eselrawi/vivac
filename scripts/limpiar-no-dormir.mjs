// Quita del catálogo los sitios donde no se puede dormir (casetas de guardas, depósitos, ermitas, topónimos sin construcción…).
// Usa las etiquetas originales de OpenStreetMap (data/raw/osm*.json). Los quitados no se borran: pasan a descartados.json y al CSV de revisión.
// Uso: node scripts/limpiar-no-dormir.mjs         → solo muestra lo que quitaría
//      node scripts/limpiar-no-dormir.mjs --aplicar
import { readFileSync, writeFileSync } from 'node:fs'

const APLICAR = process.argv.includes('--aplicar')
const places = JSON.parse(readFileSync('public/data/places.json', 'utf8'))
const desc = JSON.parse(readFileSync('public/data/descartados.json', 'utf8'))
const raw = {}
for (const f of ['osm.json', 'osm2.json']) for (const e of JSON.parse(readFileSync(`data/raw/${f}`, 'utf8')).elements) raw[e.type[0] + e.id] = e.tags ?? {}
const norm = (s) => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const tagsOf = (p) => { const m = /osm-([nwr])(\d+)/.exec(p.id); return m ? raw[m[1] + m[2]] ?? {} : {} }

const SLEEP = new Set(['refugio_libre', 'refugio_pago', 'parapeto', 'abrigo', 'bunker'])
const KEEP_NAME = /chozo|choza|refugio|vivac|cabana|majada|cueva|bunker|fortin/ // aunque sea edificio agrícola, si se llama así lo dejo
const GUARD = /casa forestal|casa del guarda|choza del guarda|caseta de vigilancia|reten|casilla|peones camineros|obras publicas|guarderia|cuartel|subdelegacion/
const OTHER = /observatorio|quiosco|mirador|furgoneta|molino|finca |rancho|casa del baldio|\bsima\b|\btorca\b|\bmina\b|wolframio|paisajes de fortines|fortines y parapetos|cobertizo del deposito|deposito/

/** Devuelve el motivo si no se puede dormir, o null. */
function why(p, t) {
  const n = norm(p.name)
  const structure = t.building || t.amenity || t.tourism || t.natural || t.historic || t.military || t.shelter_type || t.man_made
  if (!structure) return 'Solo es un topónimo (Nomenclátor del IGN): no hay constancia de que exista construcción'
  if (/cerrado/.test(norm(t.note))) return 'En OpenStreetMap consta cerrado al uso montañero'
  if (t.access === 'customers' && t.fee === 'yes' && !/finca/.test(n)) return null // refugio de pago: se reclasifica
  if (['private', 'no', 'customers'].includes(t.access)) return 'Acceso privado o restringido en OpenStreetMap'
  if (t.natural === 'cave_entrance' && (t.access === 'permit' || t.historic === 'archaeological_site' && t.access === 'permit')) return 'Cueva protegida (yacimiento arqueológico con permiso)'
  if (t.man_made === 'storage_tank' || /deposito/.test(n) || /antiincendios/.test(norm(t.operator))) return 'Depósito de agua o caseta del servicio antiincendios: no es un refugio'
  if (t.amenity === 'place_of_worship' || /ermita|capilla|iglesia/.test(n)) return 'Ermita o iglesia: edificio de culto, normalmente cerrado'
  if (GUARD.test(n)) return 'Casa o caseta de guardas, peones o servicios: uso oficial, normalmente cerrada'
  if (OTHER.test(n) && !(t.amenity === 'shelter' || t.tourism === 'alpine_hut') || /mirador/.test(n) && t.shelter_type === 'wildlife_hide') return 'No es un sitio donde dormir (mirador, observatorio, mina, molino, finca, albergue juvenil…)'
  if (['picnic_shelter', 'gazebo', 'wildlife_hide'].includes(t.shelter_type) && !KEEP_NAME.test(n)) return 'Merendero, templete u observatorio de fauna: no es un refugio'
  if ((t.building === 'barn' || t.building === 'farm_auxiliary') && !KEEP_NAME.test(n)) return 'Edificio agrícola o ganadero, normalmente privado y cerrado'
  if (t.building === 'shed' && !t.amenity && !t.tourism && !KEEP_NAME.test(n)) return 'Cobertizo de almacén (building=shed): no es un refugio'
  if (p.kind === 'bunker' && (t.ruins === 'yes' || t.building === 'ruins')) return 'Búnker en ruinas: sin techo'
  return null
}

const reclas = (p, t) => (p.kind !== 'refugio_pago' && (/juvenil/.test(norm(p.name)) || (t.access === 'customers' && t.fee === 'yes')) ? 'refugio_pago' : null)
const out = [], quitados = [], pagados = []
for (const p of places) {
  if (!SLEEP.has(p.kind)) { out.push(p); continue }
  const m = why(p, tagsOf(p))
  if (m) quitados.push({ p, m })
  else { const k = reclas(p, tagsOf(p)); if (k) { p.kind = k; pagados.push(p.name) } out.push(p) }
}
const by = {}
for (const q of quitados) by[q.m] = (by[q.m] ?? 0) + 1
console.log(`Sitios para dormir: ${places.filter((p) => SLEEP.has(p.kind)).length} → quitaría ${quitados.length}`)
console.log(by)
console.log('pasan a refugio de pago:', pagados.join(', '))
if (!APLICAR) {
  const ver = process.argv.find((a) => a.startsWith('--ver='))?.slice(6)
  for (const q of quitados) if (!ver || q.m.includes(ver)) console.log(`${q.p.id} | ${q.p.kind} | ${q.p.name} | ${JSON.stringify(tagsOf(q.p)).slice(0, 140)}`)
} else {
  const ya = new Set(desc.map((d) => d.id))
  for (const { p, m } of quitados) if (!ya.has(p.id)) desc.push({ id: p.id, name: p.name, kind: p.kind, lat: p.lat, lng: p.lng, ele: p.ele ?? null, motivo: m, fuente: p.source })
  writeFileSync('public/data/places.json', JSON.stringify(out))
  writeFileSync('public/data/descartados.json', JSON.stringify(desc))
  writeFileSync('data/review/descartados.csv', '﻿' + ['id;nombre;tipo;lat;lng;altitud;motivo;fuente', ...desc.map((d) => [d.id, d.name, d.kind, d.lat, d.lng, d.ele ?? '', d.motivo, d.fuente].map((x) => String(x).replace(/;/g, ',')).join(';'))].join('\n'))
  console.log('aplicado: catálogo', out.length, '| descartados', desc.length)
}
