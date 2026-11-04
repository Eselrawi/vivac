// Completa altitudes que faltan (modelo de elevación AWS terrarium) y precalcula
// tiempos en coche desde casa a cada aparcamiento (OSRM, perfil driving-car, gratis).
import { readFileSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'

const HOME = { lat: 40.4436, lng: -3.9944 }
const places = JSON.parse(readFileSync('public/data/places.json', 'utf8'))

// ---------- Altitud ----------
const Z = 12
const tileCache = new Map()
async function tile(x, y) {
  const k = `${x}/${y}`
  if (!tileCache.has(k)) {
    const r = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${x}/${y}.png`)
    if (!r.ok) throw new Error(`tile ${k} ${r.status}`)
    const { data, info } = await sharp(Buffer.from(await r.arrayBuffer())).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    tileCache.set(k, { data, w: info.width })
  }
  return tileCache.get(k)
}
async function elevation(lat, lng) {
  const n = 2 ** Z
  const fx = ((lng + 180) / 360) * n
  const rad = (lat * Math.PI) / 180
  const fy = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n
  const t = await tile(Math.floor(fx), Math.floor(fy))
  const px = Math.min(255, Math.floor((fx % 1) * 256))
  const py = Math.min(255, Math.floor((fy % 1) * 256))
  const i = (py * t.w + px) * 3
  return Math.round(t.data[i] * 256 + t.data[i + 1] + t.data[i + 2] / 256 - 32768)
}

let filled = 0
for (const p of places) {
  if (p.ele == null) {
    try { p.ele = await elevation(p.lat, p.lng); p.eleDem = true; filled++ } catch (e) { console.log('sin altitud', p.id, String(e)) }
  }
}
// Solo accesos de montaña: fuera aparcamientos de pueblo.
const TOWN = /plaza|centro comercial|municipal|catedral|hospital|acueducto|camiones|autobuses|ferial|urgencias|obras|protecci|minusv|ambulanc|emergencia|ave|polideportivo|tienda|zoco|disuasorio|brigada|bar |casa |fábrica|ecuestre|hueco|colón|espejos|oblatas|toros|sur$|norte$|este$/i
const MAN = [
  { id: 'man-cotos', name: 'Puerto de Cotos', lat: 40.82327, lng: -3.96243, ele: 1830 },
  { id: 'man-navacerrada', name: 'Puerto de Navacerrada', lat: 40.78891, lng: -4.00358, ele: 1858 },
  { id: 'man-morcuera', name: 'Puerto de la Morcuera', lat: 40.82822, lng: -3.83188, ele: 1773 },
  { id: 'man-canencia', name: 'Puerto de Canencia', lat: 40.86888, lng: -3.76379, ele: 1504 },
  { id: 'man-navafria', name: 'Puerto de Navafría', lat: 40.98664, lng: -3.81406, ele: 1774 },
]
for (let i = places.length - 1; i >= 0; i--) {
  const p = places[i]
  if (p.kind !== 'parking') continue
  const keep = (p.ele >= 1500) || (p.ele >= 1090 && !TOWN.test(p.name)) || /cercedilla/i.test(p.name)
  if (!keep) places.splice(i, 1)
  else if (p.name === 'Aparcamiento') p.name = 'Aparcamiento a ' + p.ele + ' m'
}
for (const m of MAN) if (!places.some((p) => p.kind === 'parking' && Math.hypot((p.lat - m.lat) * 111000, (p.lng - m.lng) * 84000) < 400)) places.push({ ...m, kind: 'parking', verified: false, source: 'OpenStreetMap (puerto)' })
const RENAME = { 'Dos Castillas': 'Puerto de Navacerrada (Dos Castillas)', 'Aparcamiento quitanieves': 'Puerto de Navacerrada (quitanieves)', 'Aparcamiento de Albergue Peñalara': 'Navacerrada (Albergue Peñalara)', 'Aparcamiento Puerto de la Morcuera': 'Puerto de la Morcuera', 'Aparcamientos en el Puerto de Navafría': 'Puerto de Navafría', 'Aparcamientos de Las Dehesas': 'Las Dehesas (Cercedilla)' }
for (const p of places) if (RENAME[p.name]) p.name = RENAME[p.name]
console.log('altitudes rellenadas:', filled, 'tiles:', tileCache.size)
writeFileSync('public/data/places.json', JSON.stringify(places))

// ---------- Tiempos en coche ----------
const parkings = places.filter((p) => p.kind === 'parking')
const coords = [HOME, ...parkings].map((p) => `${p.lng},${p.lat}`).join(';')
const dests = parkings.map((_, i) => i + 1).join(';')
const url = `https://router.project-osrm.org/table/v1/driving/${coords}?sources=0&destinations=${dests}&annotations=duration,distance`
const r = await fetch(url, { headers: { 'User-Agent': 'vivac-app/1.0 (github.com/Eselrawi/vivac)' } })
const j = await r.json()
if (j.code !== 'Ok') { console.log('OSRM falló', j.code); process.exit(1) }
const drive = {}
parkings.forEach((p, i) => {
  const min = j.durations[0][i], m = j.distances[0][i]
  if (min != null) drive[p.id] = { min: Math.round(min / 60), km: +(m / 1000).toFixed(1) }
})
writeFileSync('public/data/drive.json', JSON.stringify({ from: 'Villanueva de la Cañada', at: new Date().toISOString(), table: drive }))
console.log('tiempos en coche:', Object.keys(drive).length, 'de', parkings.length)
