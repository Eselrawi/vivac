// Descripción, confianza y fotos de cada sitio para dormir → public/data/evidence.json
// Entradas: catálogo, metadatos OSM, evidencia automática (verify.mjs, opcional), listados web y evidencia manual.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const read = (f, d) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : d)
const places = read('public/data/places.json', [])
const auto = read('data/raw/evidence-auto.json', {})
const meta = read('data/raw/osm-meta.json', {})
const manual = read('data/manual-evidence.json', {})
const lists = read('data/raw/web-lists.json', { walkaholic: [], mountain: [] })
const munis = read('data/raw/municipios.json', [])
const drive = read('public/data/drive.json', { table: {} }).table
const parkings = places.filter((p) => p.kind === 'parking' && drive[p.id])

const M = 111320
const dist = (a, b) => Math.hypot((a.lat - b.lat) * M, (a.lng - b.lng) * M * Math.cos((a.lat * Math.PI) / 180))
const sentence = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)
const norm = (x) => (x ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const GENERIC = new Set(['refugio', 'chozo', 'vivac', 'cueva', 'abrigo', 'casa', 'del', 'de', 'la', 'las', 'los', 'el', 'y', 'libre', 'sin', 'nombre', 'pequeno', 'cabana', 'majada', 'corral', 'parapeto', 'en', 'al', 'shelter', 'hut', 'mina', 'antigua', 'abandonada', 'mirador', 'caseta', 'cobertizo', 'ruinas', 'pastores', 'pastor'])
const toks = (n) => norm(n).split(/[^a-z0-9]+/).filter((t) => t.length >= 4 && !GENERIC.has(t))

// ---- Municipios: se cosen los trozos de cada límite y se prueba el punto dentro ----
function stitch(segs) {
  const rings = []
  const pool = segs.map((s) => s.slice())
  const eq = (p, q) => Math.abs(p[0] - q[0]) < 1e-7 && Math.abs(p[1] - q[1]) < 1e-7
  while (pool.length) {
    let ring = pool.pop()
    let grew = true
    while (grew) {
      grew = false
      for (let i = 0; i < pool.length; i++) {
        const s = pool[i]
        const a = ring[0], b = ring[ring.length - 1], sa = s[0], sb = s[s.length - 1]
        if (eq(b, sa)) ring = ring.concat(s.slice(1))
        else if (eq(b, sb)) ring = ring.concat(s.slice(0, -1).reverse())
        else if (eq(a, sb)) ring = s.slice(0, -1).concat(ring)
        else if (eq(a, sa)) ring = s.slice(1).reverse().concat(ring)
        else continue
        pool.splice(i, 1); grew = true; break
      }
    }
    rings.push(ring)
  }
  return rings
}
const inRing = (x, y, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) if ((r[i][1] > y) !== (r[j][1] > y) && x < ((r[j][0] - r[i][0]) * (y - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c; return c }
const muniRings = munis.map((m) => ({ name: m.name, rings: stitch(m.rings) }))
const muniOf = (p) => muniRings.find((m) => m.rings.some((r) => inRing(p.lng, p.lat, r)))?.name ?? null

const key = (n) => norm(n).split(/[^a-z0-9]+/).filter((t) => t && !GENERIC.has(t)).join('')
const matchList = (p, arr, tol) => {
  const a = toks(p.name), ka = key(p.name)
  if (!a.length && ka.length < 6) return null
  return arr.find((w) => {
    if (!(w.ele == null || p.ele == null || Math.abs(w.ele - p.ele) <= tol)) return false
    const kb = key(w.name)
    if (ka.length >= 6 && kb.length >= 6 && (ka === kb || ka.includes(kb) || kb.includes(ka))) return true
    return toks(w.name).some((t) => a.includes(t))
  }) ?? null
}
const nearest = (p, pred, r) => places.filter(pred).map((q) => ({ q, d: dist(p, q) })).filter((x) => x.d <= r).sort((a, b) => a.d - b.d)[0]

// DIN 33466 (igual que la app)
const walkMin = (d, up, down) => { const h = d / 1000 / 4, v = up / 300 + down / 500; return (Math.max(h, v) + Math.min(h, v) / 2) * 60 }
const fmt = (min) => { const m = Math.max(5, Math.round(min / 5) * 5); const h = Math.floor(m / 60), r = m % 60; return h ? (r ? `${h} h ${r} min` : `${h} h`) : `${m} min` }

function whatIs(p, t) {
  const n = norm(p.name)
  if (p.sub === 'bunker' || p.kind === 'bunker') return 'Búnker o fortín de la Guerra Civil: construcción de hormigón o piedra con techo. Resguarda del viento y la lluvia, pero suele ser oscuro, húmedo y con suelo irregular; mira bien el interior antes de usarlo.'
  if (p.sub === 'ermita') return 'Ermita aislada: puede tener un porche que resguarde de la lluvia; de dentro no hay datos y suele estar cerrada con llave.'
  if (p.sub === 'ruina') return 'Ruina de una construcción: puede conservar parte del techo o no. No hay datos del estado actual.'
  if (p.sub === 'chozo') return 'Construcción de pastores o ganadera (chozo, aprisco o cobertizo): da techo, aunque su estado varía mucho y puede haber ganado o suciedad.'
  if (p.sub === 'caseta') return 'Caseta o cabaña de monte (forestal, de caza o de camineros): da techo y paredes; puede estar cerrada con llave o ser privada, así que no cuentes con entrar sin comprobarlo.'
  if (p.sub === 'cueva') return 'Cueva o abrigo natural bajo roca: da techo y resguardo del viento y la lluvia; el suelo suele ser de tierra o piedras.'
  if (p.kind === 'refugio_pago') return 'Refugio guardado o albergue de pago: hay que reservar y consultar precio.'
  if (p.kind === 'parapeto') return 'Parapeto o vivac de piedra: un muro de piedra seca, sin techo, que corta el viento. Se duerme al raso con saco y funda; la protección depende de hacia dónde mira la abertura.'
  if (/covachuela/.test(n)) return 'Covachuela: abrigo pequeño bajo la roca. Da techo, pero suele caber muy poca gente.'
  if (/cueva|gruta|cova/.test(n) || t.natural === 'cave_entrance') return 'Cueva o abrigo natural bajo roca: da techo y resguardo del viento y la lluvia; el suelo suele ser de tierra o piedras.'
  if (p.kind === 'abrigo' && /majada|corral/.test(n)) return 'Nombre de lugar ligado a la ganadería (majada o corral de pastores). Puede que ya no quede construcción en pie.'
  if (/chozo|choza/.test(n)) return 'Chozo: antigua construcción de pastores, de piedra con techo de losas o ramas. Da techo, aunque su estado varía mucho.'
  if (/cabana|caseta|cobertizo/.test(n)) return 'Caseta o cabaña sencilla de uso libre: un techo y cuatro paredes, sin servicios.'
  if (/casa forestal|reten|guarda/.test(n)) return 'Construcción de uso forestal o de guardería; no siempre está abierta.'
  if (/ruina/.test(n) || t.historic === 'ruins') return 'Ruinas de un refugio: la estructura puede estar incompleta.'
  if (/mina/.test(n)) return 'Antigua mina o galería: ojo, puede ser peligrosa por derrumbes. Mejor no dormir dentro.'
  if (/mirador/.test(n)) return 'Mirador con un pequeño refugio libre.'
  if (t.shelter_type === 'weather_shelter') return 'Refugio abierto para resguardarse del mal tiempo, de uso libre.'
  return 'Refugio libre: construcción de uso abierto, sin guarda ni reserva ni servicios.'
}
function protection(p) {
  const s = p.shelter
  if (p.kind === 'refugio_pago') return ''
  if (p.kind === 'parapeto') return p.shelteredFrom?.length ? '' : 'Aún no sabemos de qué vientos resguarda: si vais, marcad la orientación en la rosa de los vientos.'
  if (s === 'cerrado') return 'Para dormir: protege de lluvia y viento si la puerta y el tejado están bien.'
  if (s === 'techo') return 'Para dormir: tiene techo, pero puede entrar el viento por algún lado.'
  return ''
}

const out = {}
const stats = { confirmado: 0, probable: 0, 'sin confirmar': 0 }
let withMuni = 0
for (const p of places) {
  if (!['refugio_libre', 'refugio_pago', 'parapeto', 'abrigo', 'bunker'].includes(p.kind)) continue
  const ids = [...p.source.matchAll(/(node|way|relation)\/(\d+)/g)].map((m) => `${m[1]}/${m[2]}`)
  const metas = ids.map((k) => meta[k]).filter(Boolean)
  const a = auto[p.id] ?? { osm: metas.map((m) => ({ v: m.v, ts: m.ts, user: m.user })), tags: Object.assign({}, ...metas.map((m) => m.tags)), photos: [], wiki: [], wd: null, geo: null }
  const t = a.tags ?? {}
  const man = manual[p.id]
  const ev = []
  let pts = 0

  const v = Math.max(0, ...a.osm.map((o) => o.v ?? 0))
  const last = a.osm.map((o) => o.ts).filter(Boolean).sort().pop()
  if (v >= 2) { pts += 1; ev.push({ s: 'OpenStreetMap', t: `Editado ${v} veces por la comunidad${last ? ` (última: ${last.slice(0, 10)})` : ''}` }) }
  else ev.push({ s: 'OpenStreetMap', t: `Un punto cartografiado por la comunidad${last ? ` (${last.slice(0, 10)})` : ''}`, weak: true })
  if (t.check_date || t['survey:date']) { pts += 2; ev.push({ s: 'OpenStreetMap', t: `Comprobado sobre el terreno el ${t.check_date ?? t['survey:date']}` }) }
  if (t.capacity || t.fireplace || t.description || t['description:es'] || t.shelter_type) pts += 1
  if (t.website || t['contact:website'] || t.operator) { pts += 2; ev.push({ s: 'Web oficial', t: t.operator ? `Gestor: ${t.operator}` : 'Tiene sitio web', url: t.website ?? t['contact:website'] }) }

  const strongPhoto = a.photos.find((x) => x.tagged || x.nameMatch)
  if (strongPhoto) { pts += 3; ev.push({ s: 'Wikimedia Commons', t: `Foto con el nombre del sitio: «${strongPhoto.title}»`, url: strongPhoto.page }) }
  else if (a.photos.length) { pts += 1; ev.push({ s: 'Wikimedia Commons', t: `${a.photos.length} foto(s) tomadas a menos de 180 m (no confirman por sí solas)`, url: a.photos[0].page, weak: true }) }
  const wp = a.wiki.find((w) => w.nameMatch)
  if (wp) { pts += 3; ev.push({ s: 'Wikipedia', t: `Artículo «${wp.title}» a ${wp.dist} m`, url: wp.url }) }
  if (a.wd) { pts += 3; ev.push({ s: 'Wikidata', t: `${a.wd.label ?? a.wd.id}${a.wd.desc ? ` — ${a.wd.desc}` : ''}`, url: `https://www.wikidata.org/wiki/${a.wd.id}` }) }

  const wk = matchList(p, lists.walkaholic, 60)
  if (wk && !(man?.web ?? []).some((w) => w.site === 'Walkaholic')) { pts += 3; ev.push({ s: 'Walkaholic', t: `Figura como «${wk.name}»${wk.beds ? `, ${wk.beds} camas` : ''}${wk.free ? ', uso libre' : ''}`, url: wk.url }) }
  const mf = matchList(p, lists.mountain, 60)
  if (mf && !(man?.web ?? []).some((w) => w.site === 'Mountain Forecast')) { pts += 3; ev.push({ s: 'Mountain Forecast', t: `Figura como «${mf.name}» (${mf.ele} m)`, url: mf.url }) }
  for (const w of man?.web ?? []) { pts += 3; ev.push({ s: w.site, t: w.note, url: w.url }) }
  if (man?.negative) { pts = -9; ev.push({ s: 'Comprobación', t: man.negative }) }

  let conf = pts >= 4 ? 'confirmado' : pts >= 2 ? 'probable' : 'sin confirmar'
  if (p.toponym && !strongPhoto && !(man?.web?.length) && !wk && !mf) { conf = 'sin confirmar'; ev.push({ s: 'Aviso', t: 'Es un nombre de lugar (majada/corral): puede que no haya construcción en pie.', weak: true }) }
  stats[conf]++

  // ---- Descripción: qué es, dónde está, para qué sirve y cómo se llega ----
  const muni = a.geo?.muni ?? muniOf(p)
  if (muni) withMuni++
  const parts = []
  parts.push(man?.desc ? sentence(man.desc) : whatIs(p, t))
  const where = [p.ele ? `${p.ele.toLocaleString('es-ES')} m de altitud` : '', muni ? `término de ${muni}` : ''].filter(Boolean).join(', ')
  if (where && !man?.desc) parts.push(cap(where) + '.')
  const data = []
  if (t.capacity) data.push(`capacidad indicada: ${t.capacity} personas`)
  if (wk?.beds && !man?.desc) data.push(`${wk.beds} camas según Walkaholic`)
  if (t.fireplace === 'yes') data.push('con chimenea')
  if (data.length && !man?.desc) parts.push(cap(data.join(', ')) + '.')
  if (t.description || t['description:es']) parts.push(sentence(t['description:es'] ?? t.description).replace(/\.?$/, '.'))
  if (wp?.extract) parts.push(sentence(wp.extract).split(/(?<=[.!?])\s+/).slice(0, 2).join(' '))
  const prot = protection(p)
  if (prot && !man?.desc) parts.push(prot)
  // Agua y acceso: lo que más pesa al elegir dónde dormir
  const f = nearest(p, (q) => q.kind === 'fuente', 700)
  if (f) parts.push(`Agua: hay una fuente a ${Math.round(f.d)} m (puede secarse en verano o helarse en invierno).`)
  else parts.push('Agua: no hay fuente conocida a menos de 700 m; lleva toda la que necesites.')
  const best = parkings.map((k) => {
    const straight = dist(p, k) * 1.3
    if (straight > 16000) return null
    const w = walkMin(straight, Math.max(0, (p.ele ?? 0) - (k.ele ?? 0)), Math.max(0, (k.ele ?? 0) - (p.ele ?? 0)))
    return { k, w, total: w + drive[k.id].min, km: straight / 1000 }
  }).filter(Boolean).sort((x, y) => x.total - y.total)[0]
  if (best) parts.push(`Acceso: desde ${best.k.name}, unos ${fmt(best.w)} andando (${best.km.toFixed(1)} km aprox.), y ${fmt(drive[best.k.id].min)} en coche desde Villanueva de la Cañada.`)
  else parts.push('Acceso: no hay aparcamiento conocido cerca; es una caminata larga desde la carretera.')
  if (conf === 'sin confirmar') parts.push('Ojo: aparece solo como un punto en el mapa; confirmad que existe antes de contar con él.')

  const photos = [...(a.photos ?? [])]
    .sort((x, y) => (y.tagged ? 2 : y.nameMatch ? 1 : 0) - (x.tagged ? 2 : x.nameMatch ? 1 : 0))
    .slice(0, 3)
    .map((x) => ({ url: x.url, page: x.page, title: x.title, author: x.author, license: x.license, own: !!(x.tagged || x.nameMatch) }))
  out[p.id] = { c: conf, d: parts.join(' '), e: ev, ph: photos, ...(muni ? { m: muni } : {}), n: pts }
}
writeFileSync('public/data/evidence.json', JSON.stringify(out))
writeFileSync('data/review/evidencia.csv', '﻿' + ['id;nombre;tipo;altitud;confianza;puntos;municipio;fuentes;descripcion', ...places.filter((p) => out[p.id]).map((p) => [p.id, p.name, p.kind, p.ele ?? '', out[p.id].c, out[p.id].n, out[p.id].m ?? '', out[p.id].e.filter((x) => !x.weak).map((x) => x.s).join(' + '), out[p.id].d.replace(/;/g, ',')].join(';'))].join('\n'))
console.log(stats, 'total', Object.keys(out).length, 'con municipio', withMuni)
