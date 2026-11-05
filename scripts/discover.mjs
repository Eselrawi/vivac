// Sitios posibles para vivac sin catalogar: terreno casi plano, cerca de una fuente y resguardado por el relieve.
// Solo son sugerencias calculadas con el modelo de elevación: hay que comprobarlas sobre el terreno.
import { readFileSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'

const Z = 14
const N2 = 2 ** Z
const places = JSON.parse(readFileSync('public/data/places.json', 'utf8'))
const springs = places.filter((p) => p.kind === 'fuente' && (p.ele ?? 0) >= 1300)
const taken = places.filter((p) => ['refugio_libre', 'refugio_pago', 'parapeto', 'abrigo'].includes(p.kind))

const tiles = new Map()
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
  const fx = ((lng + 180) / 360) * N2
  const rad = (lat * Math.PI) / 180
  const fy = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * N2
  const t = await tile(Math.floor(fx), Math.floor(fy))
  if (!t) return null
  const px = Math.min(255, Math.floor((fx % 1) * 256)), py = Math.min(255, Math.floor((fy % 1) * 256))
  const i = (py * t.w + px) * 3
  return t.data[i] * 256 + t.data[i + 1] + t.data[i + 2] / 256 - 32768
}
const M = 111320
const off = (lat, lng, dN, dE) => [lat + dN / M, lng + dE / (M * Math.cos((lat * Math.PI) / 180))]
const DIRS = [0, 45, 90, 135, 180, 225, 270, 315]
const vec = (deg) => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)] // N, E

const out = []
let done = 0
for (const s of springs) {
  let best = null
  for (let dn = -300; dn <= 300; dn += 30) for (let de = -300; de <= 300; de += 30) {
    const dw = Math.hypot(dn, de)
    if (dw < 35 || dw > 300) continue
    const [la, lo] = off(s.lat, s.lng, dn, de)
    const c = await elev(la, lo)
    if (c == null) continue
    // Pendiente con vecinos a 15 m
    const ns = await Promise.all([[15, 0], [-15, 0], [0, 15], [0, -15]].map(([a, b]) => elev(...off(la, lo, a, b))))
    if (ns.some((v) => v == null)) continue
    const slope = (Math.atan(Math.hypot((ns[0] - ns[1]) / 30, (ns[2] - ns[3]) / 30)) * 180) / Math.PI
    if (slope > 6) continue
    // Resguardo: terreno más alto (≥ 7 m) entre 60 y 130 m en esa dirección
    const sheltered = []
    for (const d of DIRS) {
      const [vn, ve] = vec(d)
      let rise = 0
      for (const r of [60, 90, 130]) {
        const e = await elev(...off(la, lo, vn * r, ve * r))
        if (e != null) rise = Math.max(rise, e - c)
      }
      if (rise >= 7) sheltered.push(d)
    }
    if (sheltered.length < 2) continue
    const score = sheltered.length * 10 - slope * 2 - dw / 40
    if (!best || score > best.score) best = { score, la, lo, c, slope, sheltered, dw }
  }
  if (best && !taken.some((t) => Math.hypot((t.lat - best.la) * M, (t.lng - best.lo) * 84000) < 120)) {
    out.push({
      id: `disc-${s.id}`, name: s.unnamed ? 'Posible vivac junto a una fuente' : `Posible vivac junto a ${s.name}`,
      kind: 'candidato', lat: +best.la.toFixed(5), lng: +best.lo.toFixed(5), ele: Math.round(best.c),
      shelter: 'raso', shelteredFrom: best.sheltered, verified: false, source: `Calculado con el modelo de elevación: pendiente ${best.slope.toFixed(1)}°, a ${Math.round(best.dw)} m de una fuente`,
    })
  }
  if (++done % 100 === 0) console.log(done, '/', springs.length, 'candidatos', out.length)
}
writeFileSync('public/data/discover.json', JSON.stringify(out))
console.log('candidatos:', out.length, 'de', springs.length, 'fuentes · tiles', tiles.size)
