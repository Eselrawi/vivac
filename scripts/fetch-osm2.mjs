// Más sitios cubiertos: búnkeres y fortines, construcciones de monte, cuevas y abrigos, ermitas aisladas y pueblos (para saber qué está aislado).
import { writeFileSync } from 'node:fs'
const BB = '40.50,-4.50,41.10,-3.60'
const NAMES = 'caseta|casilla|caba[ñn]a|choza|chozo|aprisco|refugio|porche|majada|corral|vivac|covacha|covachuela|cueva|gruta|abrigo|cova|fort[ií]n|nido de|b[uú]nker|casamata|casa del guarda|casa forestal|caser[oó]n|pajar|tenada|cercado|zahurd|navazo'
const Q = `[out:json][timeout:240];
(
  nwr["military"~"^(bunker|fort|pillbox|nuclear_explosion_site)$"](${BB});
  nwr["building"="bunker"](${BB});
  nwr["historic"~"^(fort|bunker|military)$"](${BB});
  nwr["name"~"fort[ií]n|nido de|b[uú]nker|casamata",i](${BB});
  nwr["building"~"^(cabin|barn|shed|farm_auxiliary|hut|shelter|chapel|ruins|service|hunting_lodge)$"]["name"~"${NAMES}",i](${BB});
  nwr["building"~"^(cabin|barn|shed|farm_auxiliary|hut|shelter|hunting_lodge)$"](${BB});
  nwr["natural"="cave_entrance"](${BB});
  nwr["name"~"cueva|covacha|covachuela|gruta|abrigo|cova ",i]["natural"~"^(rock|stone|cave_entrance|bare_rock|cliff|peak)$"](${BB});
  nwr["amenity"="place_of_worship"]["name"~"ermita|capilla",i](${BB});
  nwr["historic"~"^(ruins|building|farm|wayside_shrine|tower)$"]["name"~"${NAMES}",i](${BB});
  nwr["shelter_type"](${BB});
  nwr["leisure"="hunting_stand"]["shelter"="yes"](${BB});
  nwr["tourism"~"^(wilderness_hut|alpine_hut|camp_site|camp_pitch)$"](${BB});
);
out center tags;`
const SETTLE = `[out:json][timeout:120];node["place"~"^(city|town|village|hamlet|suburb|isolated_dwelling)$"](${BB});out;`
async function go(q) {
  for (let i = 0; i < 8; i++) {
    for (const m of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']) {
      try { const r = await fetch(m, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'User-Agent': 'vivac-app/1.0' } }); if (r.ok) return await r.json() } catch {}
    }
    await new Promise((r) => setTimeout(r, 15000))
  }
  throw new Error('Overpass no responde')
}
const a = await go(Q)
writeFileSync('data/raw/osm2.json', JSON.stringify(a))
const s = await go(SETTLE)
writeFileSync('data/raw/settlements.json', JSON.stringify(s.elements.map((e) => ({ lat: e.lat, lng: e.lon, place: e.tags.place, name: e.tags.name }))))
console.log('elementos', a.elements.length, 'núcleos', s.elements.length)
