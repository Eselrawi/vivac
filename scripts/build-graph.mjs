// Grafo de caminos de la sierra (OSM) en formato compacto para calcular rutas a pie sin conexión.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import sharp from 'sharp'

const S = 40.55, W = -4.45, N = 41.05, E = -3.65
const ROWS = 3, COLS = 4
const HW = 'track|path|footway|bridleway|steps|pedestrian|cycleway|service|unclassified|residential|living_street|tertiary|secondary'
mkdirSync('data/raw', { recursive: true })

// ---------- 1. Descarga por teselas ----------
const ways = new Map()
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
  const file = `data/raw/hw-${r}-${c}.json`
  let j
  if (existsSync(file)) j = JSON.parse(readFileSync(file, 'utf8'))
  else {
    const bb = [S + ((N - S) * r) / ROWS, W + ((E - W) * c) / COLS, S + ((N - S) * (r + 1)) / ROWS, W + ((E - W) * (c + 1)) / COLS].map((x) => x.toFixed(4)).join(',')
    const q = `[out:json][timeout:300];way["highway"~"^(${HW})$"]["foot"!~"^(no|private)$"]["access"!~"^(no|private)$"](${bb});out geom tags;`
    for (let attempt = 0; attempt < 8 && !j; attempt++) for (const mirror of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']) {
      if (j) break
      try {
        const res = await fetch(mirror, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'User-Agent': 'vivac-app/1.0' } })
        if (!res.ok) throw new Error(res.status)
        j = await res.json(); break
      } catch (e) { console.log('fallo', r, c, mirror, String(e)); await new Promise((x) => setTimeout(x, 20000)) }
    }
    if (!j) throw new Error('sin datos teselas ' + r + c)
    writeFileSync(file, JSON.stringify(j))
    await new Promise((x) => setTimeout(x, 3000))
  }
  for (const e of j.elements) if (e.type === 'way' && e.geometry) ways.set(e.id, e)
  console.log('tesela', r, c, 'vías acumuladas', ways.size)
}

// ---------- 2. Elevación (terrarium z12) ----------
const Z = 12
const tiles = new Map()
async function tile(x, y) {
  const k = `${x}/${y}`
  if (!tiles.has(k)) {
    const r = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${x}/${y}.png`)
    const { data, info } = await sharp(Buffer.from(await r.arrayBuffer())).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    tiles.set(k, { data, w: info.width })
  }
  return tiles.get(k)
}
const n2 = 2 ** Z
async function prefetch() {
  const x0 = Math.floor(((W + 180) / 360) * n2), x1 = Math.floor(((E + 180) / 360) * n2)
  const ty = (lat) => Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n2)
  for (let x = x0; x <= x1; x++) for (let y = ty(N); y <= ty(S); y++) await tile(x, y)
}
await prefetch()
console.log('teselas de relieve', tiles.size)
function elev(lat, lng) {
  const fx = ((lng + 180) / 360) * n2
  const rad = (lat * Math.PI) / 180
  const fy = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n2
  const t = tiles.get(`${Math.floor(fx)}/${Math.floor(fy)}`)
  if (!t) return 0
  const px = Math.min(255, Math.floor((fx % 1) * 256)), py = Math.min(255, Math.floor((fy % 1) * 256))
  const i = (py * t.w + px) * 3
  return t.data[i] * 256 + t.data[i + 1] + t.data[i + 2] / 256 - 32768
}

// ---------- 3. Grafo: nodos = cruces y extremos ----------
const key = (p) => `${Math.round(p.lat * 1e5)},${Math.round(p.lon * 1e5)}`
const use = new Map()
for (const w of ways.values()) {
  w.geometry.forEach((p, i) => {
    const k = key(p)
    use.set(k, (use.get(k) ?? 0) + (i === 0 || i === w.geometry.length - 1 ? 2 : 1))
  })
}
const nodeId = new Map()
const nodes = [] // lat1e5, lng1e5, ele
const idOf = (p) => {
  const k = key(p)
  if (!nodeId.has(k)) { nodeId.set(k, nodes.length / 3); nodes.push(Math.round(p.lat * 1e5), Math.round(p.lon * 1e5), Math.round(elev(p.lat, p.lon))) }
  return nodeId.get(k)
}

const hav = (a, b) => {
  const dy = (b.lat - a.lat) * 111320
  const dx = (b.lon - a.lon) * 111320 * Math.cos((a.lat * Math.PI) / 180)
  return Math.hypot(dx, dy)
}
function dp(pts, tol) {
  if (pts.length < 3) return pts
  const [a, b] = [pts[0], pts[pts.length - 1]]
  let md = 0, mi = 0
  for (let i = 1; i < pts.length - 1; i++) {
    const d = distSeg(pts[i], a, b)
    if (d > md) { md = d; mi = i }
  }
  if (md <= tol) return [a, b]
  return [...dp(pts.slice(0, mi + 1), tol).slice(0, -1), ...dp(pts.slice(mi), tol)]
}
function distSeg(p, a, b) {
  const k = Math.cos((p.lat * Math.PI) / 180)
  const px = (p.lon - a.lon) * k * 111320, py = (p.lat - a.lat) * 111320
  const bx = (b.lon - a.lon) * k * 111320, by = (b.lat - a.lat) * 111320
  const l2 = bx * bx + by * by
  const t = l2 ? Math.max(0, Math.min(1, (px * bx + py * by) / l2)) : 0
  return Math.hypot(px - t * bx, py - t * by)
}

// Clases: 0 pista buena/asfalto, 1 pista mala, 2 sendero, 3 sendero de montaña (sac_scale), 4 carretera, 5 escaleras
function cls(t) {
  const h = t.highway
  if (h === 'steps') return 5
  if (/^(service|unclassified|residential|living_street|tertiary|secondary)$/.test(h)) return 4
  if (t.sac_scale && t.sac_scale !== 'hiking') return 3
  if (h === 'track') return /^grade[45]$/.test(t.tracktype ?? '') ? 1 : 0
  if (h === 'path' && /^(mountain_hiking|demanding_mountain_hiking|alpine_hiking)$/.test(t.sac_scale ?? '')) return 3
  if (h === 'path' || h === 'footway' || h === 'bridleway' || h === 'pedestrian') return h === 'path' ? 2 : 0
  return 0
}

const edges = [] // u, v, len(m), asc, desc, cls, off, cnt
const geom = []  // lat1e5, lng1e5, ele ... (puntos intermedios, no incluye extremos)
for (const w of ways.values()) {
  const g = w.geometry
  const c = cls(w.tags ?? {})
  let start = 0
  for (let i = 1; i < g.length; i++) {
    if (i === g.length - 1 || use.get(key(g[i])) > 1) {
      const seg = dp(g.slice(start, i + 1), 6)
      let len = 0, asc = 0, desc = 0, prev = elev(seg[0].lat, seg[0].lon)
      const mid = []
      for (let k = 1; k < seg.length; k++) {
        len += hav(seg[k - 1], seg[k])
        const e = elev(seg[k].lat, seg[k].lon)
        if (e > prev) asc += e - prev; else desc += prev - e
        prev = e
        if (k < seg.length - 1) mid.push(Math.round(seg[k].lat * 1e5), Math.round(seg[k].lon * 1e5), Math.round(e))
      }
      const u = idOf(seg[0]), v = idOf(seg[seg.length - 1])
      if (u !== v || len > 30) {
        edges.push(u, v, Math.round(len), Math.round(asc), Math.round(desc), c, geom.length / 3, mid.length / 3)
        geom.push(...mid)
      }
      start = i
    }
  }
}
console.log('nodos', nodes.length / 3, 'aristas', edges.length / 8, 'puntos intermedios', geom.length / 3)
mkdirSync('public/data', { recursive: true })
const out = JSON.stringify({ v: 1, bbox: [S, W, N, E], nodes, edges, geom })
writeFileSync('public/data/graph.json', out)
console.log('graph.json MB:', (out.length / 1e6).toFixed(2))
