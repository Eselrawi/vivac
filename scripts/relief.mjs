// Posición topográfica de cada sitio (TPI): cuánto sobresale o se hunde respecto a su entorno a 400 m.
// >0 cresta o cumbre (más viento) · <0 vaguada o valle (aire frío acumulado en noches despejadas).
import { readFileSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'

const Z = 13, N = 2 ** Z
const places = JSON.parse(readFileSync('public/data/places.json', 'utf8'))
const disc = (() => { try { return JSON.parse(readFileSync('public/data/discover.json', 'utf8')) } catch { return [] } })()
const targets = [...places, ...disc].filter((p) => ['refugio_libre', 'refugio_pago', 'parapeto', 'abrigo', 'candidato', 'parking'].includes(p.kind))

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
  const fx = ((lng + 180) / 360) * N
  const rad = (lat * Math.PI) / 180
  const fy = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * N
  const t = await tile(Math.floor(fx), Math.floor(fy))
  if (!t) return null
  const px = Math.min(255, Math.floor((fx % 1) * 256)), py = Math.min(255, Math.floor((fy % 1) * 256))
  const i = (py * t.w + px) * 3
  return t.data[i] * 256 + t.data[i + 1] + t.data[i + 2] / 256 - 32768
}
const M = 111320
const out = {}
for (const p of targets) {
  const c = await elev(p.lat, p.lng)
  if (c == null) continue
  const ring = []
  for (let a = 0; a < 360; a += 45) {
    const dN = Math.cos((a * Math.PI) / 180) * 400, dE = Math.sin((a * Math.PI) / 180) * 400
    const e = await elev(p.lat + dN / M, p.lng + dE / (M * Math.cos((p.lat * Math.PI) / 180)))
    if (e != null) ring.push(e)
  }
  if (ring.length >= 6) out[p.id] = Math.round(c - ring.reduce((a, b) => a + b, 0) / ring.length)
}
writeFileSync('public/data/relief.json', JSON.stringify(out))
const v = Object.values(out)
console.log('sitios con relieve:', v.length, '| cresta (>40):', v.filter((x) => x > 40).length, '| valle (<-40):', v.filter((x) => x < -40).length, '| tiles', tiles.size)
