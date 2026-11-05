/// <reference lib="webworker" />
// Enrutador a pie sin conexión: A* sobre el grafo de caminos de la sierra.

type Profile = 'directo' | 'noche'
interface Graph { nodes: Int32Array; edges: Int32Array; geom: Int32Array }
let G: Graph | null = null
let adj: Int32Array // CSR: start offsets por nodo (n+1)
let adjE: Int32Array // edge*2+dir (dir 0 = u→v, 1 = v→u)
const GRID = 0.005
let grid = new Map<string, number[]>()

// Multiplicadores de tiempo por clase: pista buena, pista mala, sendero, sendero de montaña, carretera, escaleras
const MULT: Record<Profile, number[]> = {
  directo: [1, 1.1, 1.05, 1.3, 0.95, 1.5],
  noche: [1, 1.15, 1.9, 4, 1.15, 2.5],
}

function load(g: { nodes: number[]; edges: number[]; geom: number[] }) {
  G = { nodes: Int32Array.from(g.nodes), edges: Int32Array.from(g.edges), geom: Int32Array.from(g.geom) }
  const n = G.nodes.length / 3
  const m = G.edges.length / 8
  const deg = new Int32Array(n + 1)
  for (let i = 0; i < m; i++) { deg[G.edges[i * 8] + 1]++; deg[G.edges[i * 8 + 1] + 1]++ }
  for (let i = 0; i < n; i++) deg[i + 1] += deg[i]
  adj = deg
  adjE = new Int32Array(m * 2)
  const fill = new Int32Array(n)
  for (let i = 0; i < m; i++) {
    const u = G.edges[i * 8], v = G.edges[i * 8 + 1]
    adjE[adj[u] + fill[u]++] = i * 2
    adjE[adj[v] + fill[v]++] = i * 2 + 1
  }
  grid = new Map()
  for (let i = 0; i < n; i++) {
    const k = `${Math.floor(G.nodes[i * 3] / 1e5 / GRID)},${Math.floor(G.nodes[i * 3 + 1] / 1e5 / GRID)}`
    const a = grid.get(k)
    if (a) a.push(i); else grid.set(k, [i])
  }
}

const dist = (aLat: number, aLng: number, bLat: number, bLng: number) => Math.hypot((bLat - aLat) * 111320, (bLng - aLng) * 111320 * Math.cos((aLat * Math.PI) / 180))

function snap(lat: number, lng: number): { id: number; d: number } | null {
  const g = G!
  const gy = Math.floor(lat / GRID), gx = Math.floor(lng / GRID)
  let best = -1, bd = Infinity
  for (let r = 0; r <= 4 && best < 0; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const a = grid.get(`${gy + dy},${gx + dx}`)
      if (!a) continue
      for (const id of a) {
        const d = dist(lat, lng, g.nodes[id * 3] / 1e5, g.nodes[id * 3 + 1] / 1e5)
        if (d < bd) { bd = d; best = id }
      }
    }
  }
  return best < 0 || bd > 1500 ? null : { id: best, d: bd }
}

/** Tobler (velocidad de marcha según la pendiente) + sobrecoste por tramo roto. Devuelve segundos. */
function edgeCost(len: number, asc: number, desc: number, cls: number, reverse: boolean, profile: Profile): number {
  const up = reverse ? desc : asc
  const down = reverse ? asc : desc
  const slope = (up - down) / Math.max(len, 1)
  const v = (6 * Math.exp(-3.5 * Math.abs(slope + 0.05))) / 3.6
  const rough = (up + down - Math.abs(up - down)) * 0.5
  return (len / Math.max(v, 0.25) + rough) * MULT[profile][cls]
}

class Heap {
  k: number[] = []; v: number[] = []
  push(key: number, val: number) {
    let i = this.k.length
    this.k.push(key); this.v.push(val)
    while (i > 0) { const p = (i - 1) >> 1; if (this.k[p] <= this.k[i]) break; [this.k[p], this.k[i]] = [this.k[i], this.k[p]]; [this.v[p], this.v[i]] = [this.v[i], this.v[p]]; i = p }
  }
  pop(): number {
    const top = this.v[0]
    const lk = this.k.pop()!, lv = this.v.pop()!
    if (this.k.length) {
      this.k[0] = lk; this.v[0] = lv
      let i = 0
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let s = i
        if (l < this.k.length && this.k[l] < this.k[s]) s = l
        if (r < this.k.length && this.k[r] < this.k[s]) s = r
        if (s === i) break
        ;[this.k[s], this.k[i]] = [this.k[i], this.k[s]]; [this.v[s], this.v[i]] = [this.v[i], this.v[s]]; i = s
      }
    }
    return top
  }
  get size() { return this.k.length }
}

function route(from: [number, number], to: [number, number], profile: Profile) {
  const g = G!
  const a = snap(from[0], from[1]), b = snap(to[0], to[1])
  if (!a || !b) return { ok: false as const, error: 'No hay caminos cerca de uno de los puntos' }
  const n = g.nodes.length / 3
  const gs = new Float64Array(n).fill(Infinity)
  const prevE = new Int32Array(n).fill(-1)
  const closed = new Uint8Array(n)
  const tLat = g.nodes[b.id * 3] / 1e5, tLng = g.nodes[b.id * 3 + 1] / 1e5
  const h = (id: number) => dist(g.nodes[id * 3] / 1e5, g.nodes[id * 3 + 1] / 1e5, tLat, tLng) / 2.2
  const open = new Heap()
  gs[a.id] = 0
  open.push(h(a.id), a.id)
  while (open.size) {
    const u = open.pop()
    if (closed[u]) continue
    if (u === b.id) break
    closed[u] = 1
    for (let p = adj[u]; p < adj[u + 1]; p++) {
      const ed = adjE[p]
      const ei = ed >> 1, rev = (ed & 1) === 1
      const o = ei * 8
      const w = rev ? g.edges[o] : g.edges[o + 1]
      if (closed[w]) continue
      const c = gs[u] + edgeCost(g.edges[o + 2], g.edges[o + 3], g.edges[o + 4], g.edges[o + 5], rev, profile)
      if (c < gs[w]) { gs[w] = c; prevE[w] = ed; open.push(c + h(w), w) }
    }
  }
  if (!isFinite(gs[b.id])) return { ok: false as const, error: 'No hay camino conectado entre esos puntos' }

  // Reconstrucción
  const segs: number[][][] = []
  let cur = b.id
  while (cur !== a.id) {
    const ed = prevE[cur], ei = ed >> 1, rev = (ed & 1) === 1, o = ei * 8
    const from_ = rev ? g.edges[o + 1] : g.edges[o]
    const pts: number[][] = [[g.nodes[from_ * 3 + 1] / 1e5, g.nodes[from_ * 3] / 1e5, g.nodes[from_ * 3 + 2]]]
    const off = g.edges[o + 6], cnt = g.edges[o + 7]
    const mid: number[][] = []
    for (let k = 0; k < cnt; k++) mid.push([g.geom[(off + k) * 3 + 1] / 1e5, g.geom[(off + k) * 3] / 1e5, g.geom[(off + k) * 3 + 2]])
    if (rev) mid.reverse()
    pts.push(...mid, [g.nodes[cur * 3 + 1] / 1e5, g.nodes[cur * 3] / 1e5, g.nodes[cur * 3 + 2]])
    segs.push(pts)
    cur = from_
  }
  segs.reverse()
  const coords: number[][] = []
  const startPt = [from[1], from[0], g.nodes[a.id * 3 + 2]]
  if (a.d > 15) coords.push(startPt)
  for (const s of segs) for (const p of s) if (!coords.length || coords[coords.length - 1][0] !== p[0] || coords[coords.length - 1][1] !== p[1]) coords.push(p)
  if (b.d > 15) coords.push([to[1], to[0], g.nodes[b.id * 3 + 2]])

  let d = 0, asc = 0, desc = 0
  const profileOut: number[][] = [[0, coords[0][2]]]
  for (let i = 1; i < coords.length; i++) {
    d += dist(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0])
    const dz = coords[i][2] - coords[i - 1][2]
    if (dz > 0) asc += dz; else desc -= dz
    profileOut.push([d, coords[i][2]])
  }
  return { ok: true as const, coords, dist: d, asc, desc, snapStart: a.d, snapEnd: b.d, profile: profileOut }
}

self.onmessage = async (ev: MessageEvent) => {
  const m = ev.data
  try {
    if (m.type === 'load') {
      const j = await (await fetch(m.url)).json()
      load(j)
      self.postMessage({ type: 'ready' })
    } else if (m.type === 'edges') {
      if (!G) return self.postMessage({ type: 'edges', id: m.id, ok: false })
      const g = G
      const [w, s, e, n] = m.bbox as number[]
      const out: Array<{ c: number; p: number[] }> = []
      for (let i = 0; i < g.edges.length / 8 && out.length < (m.max ?? 9000); i++) {
        const o = i * 8, cls = g.edges[o + 5]
        if (cls === 4) continue // las carreteras ya salen en el mapa base
        const u = g.edges[o], v = g.edges[o + 1]
        const ulat = g.nodes[u * 3] / 1e5, ulng = g.nodes[u * 3 + 1] / 1e5, vlat = g.nodes[v * 3] / 1e5, vlng = g.nodes[v * 3 + 1] / 1e5
        const inU = ulng >= w && ulng <= e && ulat >= s && ulat <= n, inV = vlng >= w && vlng <= e && vlat >= s && vlat <= n
        if (!inU && !inV) continue
        const p = [ulng, ulat]
        for (let k = 0; k < g.edges[o + 7]; k++) p.push(g.geom[(g.edges[o + 6] + k) * 3 + 1] / 1e5, g.geom[(g.edges[o + 6] + k) * 3] / 1e5)
        p.push(vlng, vlat)
        out.push({ c: cls, p })
      }
      self.postMessage({ type: 'edges', id: m.id, ok: true, edges: out })
    } else if (m.type === 'route') {
      if (!G) return self.postMessage({ type: 'result', id: m.id, ok: false, error: 'El mapa de caminos aún no está cargado' })
      self.postMessage({ type: 'result', id: m.id, ...route(m.from, m.to, m.profile) })
    }
  } catch (e) {
    self.postMessage({ type: 'result', id: m.id, ok: false, error: String(e) })
  }
}
