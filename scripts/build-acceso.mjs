// Estado de acceso de cada sitio cubierto (abierto, parcial, llave, reserva, cerrado o sin datos) con fuente y fecha.
// Nunca se inventa: lo que no tiene fuente queda como «sin datos».
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const read = (f, d) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : d)
const places = read('public/data/places.json', [])
const manual = read('data/manual-access.json', {})
const lists = read('data/raw/web-lists.json', { walkaholic: [], mountain: [] })
const meta = read('data/raw/osm-meta.json', {})
const evidence = read('public/data/evidence.json', {})
const norm = (x) => (x ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const GENERIC = new Set(['refugio', 'chozo', 'vivac', 'cueva', 'abrigo', 'casa', 'del', 'de', 'la', 'las', 'los', 'el', 'y', 'libre', 'sin', 'nombre', 'caseta', 'mirador'])
const key = (n) => norm(n).split(/[^a-z0-9]+/).filter((t) => t && !GENERIC.has(t)).join('')
const M = 111320
const dist = (a, b) => Math.hypot((a.lat - b.lat) * M, (a.lng - b.lng) * M * Math.cos((a.lat * Math.PI) / 180))
const match = (p, arr, tol) => { const a = key(p.name); if (a.length < 5) return null; return arr.find((w) => { const b = key(w.name); return b.length >= 5 && (a === b || a.includes(b) || b.includes(a)) && (w.ele == null || p.ele == null || Math.abs(w.ele - p.ele) <= tol) }) ?? null }

const SLEEP = ['refugio_libre', 'refugio_pago', 'parapeto', 'abrigo', 'bunker']
const out = {}
const counts = {}
const rows = []
for (const p of places) {
  if (!SLEEP.includes(p.kind)) continue
  const m = manual[p.id]
  const ids = [...p.source.matchAll(/(node|way|relation)\/(\d+)/g)].map((x) => `${x[1]}/${x[2]}`)
  const tags = Object.assign({}, ...ids.map((k) => meta[k]?.tags ?? {}), p.osm ?? {})
  const wk = match(p, lists.walkaholic, 60)
  const mf = match(p, lists.mountain, 60)
  let rec
  if (m) rec = { estado: m.estado, nota: m.nota, fecha: m.fecha ?? null, fuentes: m.fuentes ?? [], precio: m.precio ?? null, llave: m.llave ?? null, invierno: m.invierno ?? {} }
  else if (p.kind === 'refugio_pago') rec = { estado: 'reserva', nota: 'Refugio o albergue de pago: precio y reserva, consultar. No hay precio confirmado.', fecha: null, fuentes: [], precio: { texto: 'consultar', fecha: null } }
  else if (wk?.free) rec = { estado: 'abierto', nota: `Figura como refugio de uso libre en Walkaholic${wk.beds ? ` (${wk.beds} camas)` : ''}. Sin fecha: no hay confirmación reciente.`, fecha: null, fuentes: [{ site: 'Walkaholic', url: wk.url, fecha: null }], invierno: wk.beds ? { plazas: `${wk.beds} (Walkaholic)` } : {} }
  else if (mf) rec = { estado: 'sin_datos', nota: 'Figura en Mountain Forecast, pero sin datos de si está abierto.', fecha: null, fuentes: [{ site: 'Mountain Forecast', url: mf.url, fecha: null }] }
  else if (tags.access === 'yes' || tags.access === 'permissive') rec = { estado: 'abierto', nota: 'En OpenStreetMap figura con acceso libre. Sin confirmación reciente.', fecha: null, fuentes: [{ site: 'OpenStreetMap', url: `https://www.openstreetmap.org/${ids[0] ?? ''}`, fecha: null }] }
  else if (p.sub === 'ermita') rec = { estado: 'sin_datos', nota: 'Ermita aislada: no hay datos de si tiene porche ni de si se puede entrar. Suelen estar cerradas con llave.', fecha: null, fuentes: [] }
  else if (p.sub === 'bunker') rec = { estado: 'sin_datos', nota: 'Búnker o fortín: no hay datos de su estado (puede estar tapiado o derruido).', fecha: null, fuentes: [] }
  else if (p.sub === 'ruina' || p.ruin) rec = { estado: 'sin_datos', nota: 'Aparece como ruina: puede conservar parte del techo o no. No hay datos.', fecha: null, fuentes: [] }
  else rec = { estado: 'sin_datos', nota: 'No he encontrado datos sobre si está abierto, ni fecha de la última visita.', fecha: null, fuentes: [] }

  // Datos de invierno: solo lo que consta; lo demás, «sin datos»
  const inv = { ...(rec.invierno ?? {}) }
  if (tags.fireplace === 'yes' && !inv.chimenea) inv.chimenea = 'sí (OpenStreetMap)'
  if (tags.capacity && !inv.plazas) inv.plazas = `${tags.capacity} (OpenStreetMap)`
  const fuente = places.filter((q) => q.kind === 'fuente').map((q) => ({ q, d: dist(p, q) })).sort((a, b) => a.d - b.d)[0]
  inv.agua = fuente && fuente.d <= 700 ? `fuente a ${Math.round(fuente.d)} m (puede helarse; la nieve se derrite en el hornillo)` : 'sin fuente conocida cerca: en invierno, derretir nieve'
  rec.invierno = { puerta: inv.puerta ?? null, chimenea: inv.chimenea ?? null, lena: inv.lena ?? null, suelo: inv.suelo ?? null, plazas: inv.plazas ?? null, llena: inv.llena ?? null, agua: inv.agua, nieveAcceso: null }
  out[p.id] = rec
  counts[rec.estado] = (counts[rec.estado] ?? 0) + 1
  rows.push([p.id, p.name, p.kind, p.sub ?? '', p.ele ?? '', rec.estado, rec.fecha ?? 'sin fecha', rec.fuentes.map((f) => `${f.site}${f.fecha ? ` (${f.fecha})` : ''}`).join(' + '), rec.fuentes.map((f) => f.url).join(' '), rec.precio?.texto ?? '', rec.llave ? `${rec.llave.quien ?? ''} ${rec.llave.tel ?? ''}` : '', rec.nota].map((x) => String(x).replace(/;/g, ',').replace(/\n/g, ' ')).join(';'))
}
writeFileSync('public/data/acceso.json', JSON.stringify(out))
writeFileSync('data/review/acceso-refugios.csv', '﻿' + ['id;nombre;tipo;subtipo;altitud;estado;fecha_dato;fuentes;enlaces;precio;llave;nota', ...rows].join('\n'))
const byKind = {}
for (const p of places) if (SLEEP.includes(p.kind) && !p.toponym) byKind[p.sub ?? p.kind] = (byKind[p.sub ?? p.kind] ?? 0) + 1
console.log('estados:', counts, '| por tipo (sin topónimos):', byKind)
