// Cruza cada sitio para dormir con fuentes independientes y guarda la evidencia en data/raw/evidence-auto.json
// Fuentes: historial de OpenStreetMap, Wikimedia Commons (fotos cercanas y por etiqueta), Wikidata, Wikipedia (es) y Nominatim.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const UA = { 'User-Agent': 'vivac-app/1.0 (https://github.com/Eselrawi/vivac; verificacion de sitios)' }
const places = JSON.parse(readFileSync('public/data/places.json', 'utf8')).filter((p) => ['refugio_libre', 'refugio_pago', 'parapeto', 'abrigo'].includes(p.kind))
const OUT = 'data/raw/evidence-auto.json'
const out = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const norm = (s) => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const GENERIC = new Set(['refugio', 'chozo', 'vivac', 'cueva', 'abrigo', 'casa', 'del', 'de', 'la', 'las', 'los', 'el', 'y', 'libre', 'sin', 'nombre', 'pequeno', 'cabana', 'majada', 'corral', 'parapeto', 'en', 'al'])
const tokens = (name) => norm(name).split(/[^a-z0-9]+/).filter((t) => t.length >= 4 && !GENERIC.has(t))

async function j(url, opts = {}) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: UA, ...opts })
      if (r.ok) return await r.json()
      if (r.status === 429 || r.status >= 500) await sleep(4000 * (i + 1))
      else return null
    } catch { await sleep(2000) }
  }
  return null
}

// ---- 1. Etiquetas completas y metadatos de OSM por lotes ----
const ids = { node: [], way: [], relation: [] }
const idOf = new Map()
for (const p of places) {
  for (const m of p.source.matchAll(/(node|way|relation)\/(\d+)/g)) {
    ids[m[1]].push(m[2])
    if (!idOf.has(p.id)) idOf.set(p.id, [])
    idOf.get(p.id).push(`${m[1]}/${m[2]}`)
  }
}
const meta = {}
if (!existsSync('data/raw/osm-meta.json')) {
  for (const type of ['node', 'way', 'relation']) {
    const list = [...new Set(ids[type])]
    for (let i = 0; i < list.length; i += 150) {
      const q = `[out:json][timeout:120];${type}(id:${list.slice(i, i + 150).join(',')});out meta tags center;`
      const r = await j('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(q) })
      for (const e of r?.elements ?? []) meta[`${type}/${e.id}`] = { tags: e.tags ?? {}, ts: e.timestamp, v: e.version, user: e.user, cs: e.changeset, lat: e.lat ?? e.center?.lat, lng: e.lon ?? e.center?.lon }
      console.log('OSM meta', type, i, Object.keys(meta).length)
      await sleep(2500)
    }
  }
  writeFileSync('data/raw/osm-meta.json', JSON.stringify(meta))
} else Object.assign(meta, JSON.parse(readFileSync('data/raw/osm-meta.json', 'utf8')))

// ---- 2. Por sitio: Commons, Wikipedia, Wikidata, Nominatim ----
const strip = (h) => (h ?? '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').trim()
async function commonsNear(p) {
  const qs = new URLSearchParams({ action: 'query', generator: 'geosearch', ggscoord: `${p.lat}|${p.lng}`, ggsradius: '180', ggsnamespace: '6', ggslimit: '8', prop: 'imageinfo|coordinates', iiprop: 'url|extmetadata|mime', iiurlwidth: '900', format: 'json' })
  const r = await j(`https://commons.wikimedia.org/w/api.php?${qs}`)
  return Object.values(r?.query?.pages ?? {}).map((pg) => ({ pg, i: pg.imageinfo?.[0] })).filter((x) => x.i && /^image\/(jpeg|png|webp)/.test(x.i.mime)).map(({ pg, i }) => ({
    url: i.thumburl ?? i.url, page: i.descriptionurl, title: pg.title.replace(/^File:/, ''), desc: strip(i.extmetadata?.ImageDescription?.value).slice(0, 220),
    author: strip(i.extmetadata?.Artist?.value) || 'Autor desconocido', license: strip(i.extmetadata?.LicenseShortName?.value) || 'Ver licencia',
  }))
}
async function commonsTag(tag) {
  if (!tag) return []
  const t = tag.startsWith('File:') || tag.startsWith('Category:') ? tag : `File:${tag}`
  const qs = t.startsWith('Category:')
    ? new URLSearchParams({ action: 'query', generator: 'categorymembers', gcmtitle: t, gcmtype: 'file', gcmlimit: '4', prop: 'imageinfo', iiprop: 'url|extmetadata|mime', iiurlwidth: '900', format: 'json' })
    : new URLSearchParams({ action: 'query', titles: t, prop: 'imageinfo', iiprop: 'url|extmetadata|mime', iiurlwidth: '900', format: 'json' })
  const r = await j(`https://commons.wikimedia.org/w/api.php?${qs}`)
  return Object.values(r?.query?.pages ?? {}).map((pg) => ({ pg, i: pg.imageinfo?.[0] })).filter((x) => x.i && /^image\//.test(x.i.mime)).map(({ pg, i }) => ({
    url: i.thumburl ?? i.url, page: i.descriptionurl, title: pg.title.replace(/^File:/, ''), desc: strip(i.extmetadata?.ImageDescription?.value).slice(0, 220),
    author: strip(i.extmetadata?.Artist?.value) || 'Autor desconocido', license: strip(i.extmetadata?.LicenseShortName?.value) || 'Ver licencia', tagged: true,
  }))
}
async function wikipediaNear(p) {
  const r = await j(`https://es.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${p.lat}|${p.lng}&gsradius=400&gslimit=5&format=json`)
  const hits = r?.query?.geosearch ?? []
  const out = []
  for (const h of hits.slice(0, 3)) {
    const e = await j(`https://es.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&exsentences=3&pageids=${h.pageid}&format=json`)
    out.push({ title: h.title, dist: Math.round(h.dist), extract: (e?.query?.pages?.[h.pageid]?.extract ?? '').slice(0, 420), url: `https://es.wikipedia.org/?curid=${h.pageid}` })
  }
  return out
}
async function wikidata(q) {
  if (!q) return null
  const r = await j(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${q}&props=labels|descriptions|claims&languages=es|en&format=json`)
  const e = r?.entities?.[q]
  if (!e) return null
  const p18 = e.claims?.P18?.[0]?.mainsnak?.datavalue?.value
  return { id: q, label: e.labels?.es?.value ?? e.labels?.en?.value, desc: e.descriptions?.es?.value ?? e.descriptions?.en?.value, image: p18 }
}
async function nominatim(p) {
  const r = await j(`https://nominatim.openstreetmap.org/reverse?lat=${p.lat}&lon=${p.lng}&format=jsonv2&zoom=14&accept-language=es&addressdetails=1`)
  const a = r?.address
  if (!a) return null
  return { muni: a.village ?? a.town ?? a.city ?? a.municipality ?? a.hamlet ?? null, prov: a.province ?? a.state_district ?? null, area: a.suburb ?? a.locality ?? a.natural ?? null }
}

let n = 0
for (const p of places) {
  if (out[p.id]?.done) continue
  const tag = (idOf.get(p.id) ?? []).map((k) => meta[k]).filter(Boolean)
  const t = Object.assign({}, ...tag.map((m) => m.tags))
  const toks = tokens(p.name)
  const near = await commonsNear(p)
  const tagged = [...(await commonsTag(t.wikimedia_commons)), ...(t.image && /commons\.wikimedia\.org\/wiki\/(File:[^?#]+)/.test(t.image) ? await commonsTag(decodeURIComponent(t.image.match(/wiki\/(File:[^?#]+)/)[1])) : [])]
  const wp = await wikipediaNear(p)
  const wd = await wikidata(t.wikidata)
  const geo = await nominatim(p)
  await sleep(1100) // Nominatim: 1 petición por segundo
  const named = (s) => toks.length && toks.some((k) => norm(s).includes(k))
  out[p.id] = {
    done: true,
    osm: tag.map((m) => ({ v: m.v, ts: m.ts, user: m.user })),
    tags: Object.fromEntries(Object.entries(t).filter(([k]) => /^(name|description|description:es|note|wikidata|wikipedia|wikimedia_commons|image|website|contact:website|operator|opening_hours|capacity|fireplace|shelter_type|ruins|start_date|check_date|survey:date|source|access|fee|ele|amenity|tourism|building|historic|natural|toilets|drinking_water|heating|bed|beds|reservation|phone)$/.test(k))),
    photos: [...tagged, ...near.filter((x) => !tagged.some((y) => y.url === x.url)).map((x) => ({ ...x, nameMatch: named(x.title + ' ' + x.desc) }))],
    wiki: wp.map((w) => ({ ...w, nameMatch: named(w.title + ' ' + w.extract) })),
    wd, geo,
  }
  if (++n % 25 === 0) { writeFileSync(OUT, JSON.stringify(out)); console.log('procesados', n, '/', places.length) }
}
writeFileSync(OUT, JSON.stringify(out))
console.log('listo', Object.keys(out).length)
