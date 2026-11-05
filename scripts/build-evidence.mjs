// Une la evidencia automática (verify.mjs) y la manual (data/manual-evidence.json) y genera public/data/evidence.json
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const places = JSON.parse(readFileSync('public/data/places.json', 'utf8'))
const auto = JSON.parse(readFileSync('data/raw/evidence-auto.json', 'utf8'))
const manual = existsSync('data/manual-evidence.json') ? JSON.parse(readFileSync('data/manual-evidence.json', 'utf8')) : {}
const KIND = { refugio_libre: 'Refugio libre', refugio_pago: 'Refugio de pago', parapeto: 'Parapeto o vivac de piedra', abrigo: 'Abrigo o cueva' }
const M = 111320
const dist = (a, b) => Math.hypot((a.lat - b.lat) * M, (a.lng - b.lng) * M * Math.cos((a.lat * Math.PI) / 180))
const namedAround = (p, kind, r) => places.filter((q) => q.kind === kind && !q.unnamed && q.name !== 'Sin nombre').map((q) => ({ q, d: dist(p, q) })).filter((x) => x.d <= r).sort((a, b) => a.d - b.d)[0]
const sentence = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const first = (s, n = 2) => sentence(s).split(/(?<=[.!?])\s+/).slice(0, n).join(' ')

const out = {}
const stats = { confirmado: 0, probable: 0, 'sin confirmar': 0 }
for (const p of places) {
  if (!['refugio_libre', 'refugio_pago', 'parapeto', 'abrigo'].includes(p.kind)) continue
  const a = auto[p.id]
  if (!a) continue
  const man = manual[p.id]
  const ev = []
  let pts = 0
  const t = a.tags ?? {}

  const v = Math.max(0, ...a.osm.map((o) => o.v ?? 0))
  const last = a.osm.map((o) => o.ts).filter(Boolean).sort().pop()
  if (v >= 2) { pts += 1; ev.push({ s: 'OpenStreetMap', t: `Editado ${v} veces por la comunidad (última: ${last?.slice(0, 10)})` }) }
  else ev.push({ s: 'OpenStreetMap', t: `Un punto cartografiado por la comunidad${last ? ` (${last.slice(0, 10)})` : ''}`, weak: true })
  if (t.check_date || t['survey:date']) { pts += 2; ev.push({ s: 'OpenStreetMap', t: `Comprobado sobre el terreno el ${t.check_date ?? t['survey:date']}` }) }
  if (t.capacity || t.fireplace || t.description || t['description:es'] || t.shelter_type) pts += 1
  if (t.website || t['contact:website'] || t.operator) { pts += 2; ev.push({ s: 'Web oficial', t: `Figura con ${t.operator ? `gestor (${t.operator})` : 'sitio web'}`, url: t.website ?? t['contact:website'] }) }

  const strongPhoto = a.photos.find((x) => x.tagged || x.nameMatch)
  if (strongPhoto) { pts += 3; ev.push({ s: 'Wikimedia Commons', t: `Foto con el nombre del sitio: «${strongPhoto.title}»`, url: strongPhoto.page }) }
  else if (a.photos.length) { pts += 1; ev.push({ s: 'Wikimedia Commons', t: `${a.photos.length} foto(s) tomadas a menos de 180 m (no confirman por sí solas)`, url: a.photos[0].page, weak: true }) }

  const wp = a.wiki.find((w) => w.nameMatch)
  if (wp) { pts += 3; ev.push({ s: 'Wikipedia', t: `Artículo «${wp.title}» a ${wp.dist} m`, url: wp.url }) }
  if (a.wd) { pts += 3; ev.push({ s: 'Wikidata', t: `${a.wd.label ?? a.wd.id}${a.wd.desc ? ` — ${a.wd.desc}` : ''}`, url: `https://www.wikidata.org/wiki/${a.wd.id}` }) }
  for (const w of man?.web ?? []) { pts += 3; ev.push({ s: w.site, t: w.note, url: w.url }) }
  if (man?.negative) { pts = -9; ev.push({ s: 'Comprobación', t: man.negative }) }

  let conf = pts >= 4 ? 'confirmado' : pts >= 2 ? 'probable' : 'sin confirmar'
  if (p.toponym && conf === 'confirmado' && !strongPhoto && !(man?.web?.length)) conf = 'probable'
  if (p.toponym && !strongPhoto && !(man?.web?.length)) { conf = 'sin confirmar'; ev.push({ s: 'Aviso', t: 'Es un nombre de lugar (majada/corral): puede que no haya construcción en pie.', weak: true }) }
  stats[conf]++

  // Descripción solo con datos comprobables
  const parts = []
  const place = a.geo?.muni ? `en ${a.geo.muni}${a.geo.prov && a.geo.prov !== a.geo.muni ? ` (${a.geo.prov.replace(/^Provincia de /, '')})` : ''}` : ''
  parts.push(`${KIND[p.kind]}${p.ele ? ` a ${p.ele.toLocaleString('es-ES')} m` : ''}${place ? `, ${place}` : ''}.`)
  if (t.shelter_type === 'basic_hut') parts.push('Cabaña sencilla de refugio.')
  if (t.shelter_type === 'rock_shelter') parts.push('Abrigo natural bajo roca.')
  if (t.shelter_type === 'weather_shelter') parts.push('Refugio para resguardarse del mal tiempo.')
  if (t.amenity === 'shelter' && p.kind === 'refugio_libre' && !t.shelter_type) parts.push('Marcado como refugio abierto.')
  if (t.natural === 'cave_entrance') parts.push('Entrada de cueva.')
  if (t.historic === 'ruins' || t.ruins === 'yes') parts.push('Aparece como ruina.')
  if (t.capacity) parts.push(`Capacidad indicada: ${t.capacity} personas.`)
  if (t.fireplace === 'yes') parts.push('Con chimenea.')
  if (t.description || t['description:es']) parts.push(sentence(t['description:es'] ?? t.description).replace(/\.?$/, '.'))
  if (wp?.extract) parts.push(first(wp.extract))
  if (a.wd?.desc && !wp) parts.push(sentence(a.wd.desc).replace(/^./, (c) => c.toUpperCase()).replace(/\.?$/, '.'))
  if (man?.desc) parts.push(sentence(man.desc))
  const f = namedAround(p, 'fuente', 600)
  const c = namedAround(p, 'cumbre', 1500)
  if (f) parts.push(`A ${Math.round(f.d)} m está ${f.q.name === 'Fuente' ? 'una fuente' : `la fuente ${f.q.name.replace(/^Fuente\s*/i, '')}`}.`)
  if (c) parts.push(`Cerca de ${c.q.name} (${Math.round(c.d)} m).`)

  const photos = [...(a.photos ?? [])]
    .sort((x, y) => (y.tagged ? 2 : y.nameMatch ? 1 : 0) - (x.tagged ? 2 : x.nameMatch ? 1 : 0))
    .slice(0, 3)
    .map((x) => ({ url: x.url, page: x.page, title: x.title, author: x.author, license: x.license, own: !!(x.tagged || x.nameMatch) }))
  if (man?.photo) photos.unshift(man.photo)

  out[p.id] = { c: conf, d: parts.join(' '), e: ev, ph: photos, ...(a.geo?.muni ? { m: a.geo.muni } : {}), n: pts }
}
writeFileSync('public/data/evidence.json', JSON.stringify(out))
writeFileSync('data/review/evidencia.csv', '﻿' + ['id;nombre;tipo;altitud;confianza;puntos;municipio;fuentes;descripcion', ...places.filter((p) => out[p.id]).map((p) => [p.id, p.name, p.kind, p.ele ?? '', out[p.id].c, out[p.id].n, out[p.id].m ?? '', out[p.id].e.filter((x) => !x.weak).map((x) => x.s).join(' + '), out[p.id].d.replace(/;/g, ',')].join(';'))].join('\n'))
console.log(stats, 'total', Object.keys(out).length)
