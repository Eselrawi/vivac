// Descarga de OpenStreetMap (Overpass) todo lo útil para dormir en la Sierra de Guadarrama.
import { writeFileSync, mkdirSync } from 'node:fs'

const BBOX = '40.55,-4.45,41.05,-3.65' // sur, oeste, norte, este
const Q = `[out:json][timeout:180];
(
  nwr["amenity"="shelter"](${BBOX});
  nwr["tourism"~"^(wilderness_hut|alpine_hut)$"](${BBOX});
  nwr["building"="hut"](${BBOX});
  nwr["natural"="cave_entrance"](${BBOX});
  nwr["amenity"="drinking_water"](${BBOX});
  nwr["natural"="spring"](${BBOX});
  nwr["historic"~"^(ruins|yes)$"]["name"~"majada|chozo|corral|parapeto|refugio",i](${BBOX});
  nwr["building"="ruins"]["name"~"majada|chozo|corral|parapeto|refugio",i](${BBOX});
  nwr["place"~"^(locality|isolated_dwelling)$"]["name"~"majada|chozo|corral|parapeto|refugio",i](${BBOX});
  nwr["tourism"="hostel"]["name"~"refugio|albergue",i](${BBOX});
  nwr["amenity"="parking"]["name"](${BBOX});
  nwr["natural"="peak"]["ele"](${BBOX});
);
out center tags;`

const mirrors = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']
let json
for (const m of mirrors) {
  try {
    const r = await fetch(m, { method: 'POST', body: 'data=' + encodeURIComponent(Q), headers: { 'User-Agent': 'vivac-app/1.0 (pwa guadarrama)' } })
    if (!r.ok) throw new Error(r.status)
    json = await r.json()
    break
  } catch (e) { console.log('mirror falló', m, String(e)) }
}
if (!json) process.exit(1)
mkdirSync('data/raw', { recursive: true })
writeFileSync('data/raw/osm.json', JSON.stringify(json))
console.log('elementos:', json.elements.length)
