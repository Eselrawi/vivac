import type { VivacRecord } from './db'

export interface Waypoint { name: string; lat: number; lng: number; ele?: number }
export interface TrackData { name: string; coords: [number, number, number?][] } // [lng, lat, ele]

const attr = (el: Element, a: string) => el.getAttribute(a)
const num = (s: string | null | undefined) => (s == null || s === '' ? undefined : Number(s))

export function parseGpx(text: string): { waypoints: Waypoint[]; tracks: TrackData[] } {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('Archivo GPX no válido')
  const waypoints = [...doc.querySelectorAll('wpt')].map((w) => ({
    name: w.querySelector('name')?.textContent?.trim() || 'Punto importado',
    lat: Number(attr(w, 'lat')), lng: Number(attr(w, 'lon')), ele: num(w.querySelector('ele')?.textContent),
  }))
  const tracks = [...doc.querySelectorAll('trk')].map((t, i) => ({
    name: t.querySelector('name')?.textContent?.trim() || `Track ${i + 1}`,
    coords: [...t.querySelectorAll('trkpt')].map((p) => [Number(attr(p, 'lon')), Number(attr(p, 'lat')), num(p.querySelector('ele')?.textContent)] as [number, number, number?]),
  })).filter((t) => t.coords.length > 1)
  return { waypoints, tracks }
}

export function parseKml(text: string): { waypoints: Waypoint[]; tracks: TrackData[] } {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('Archivo KML no válido')
  const waypoints: Waypoint[] = []
  const tracks: TrackData[] = []
  doc.querySelectorAll('Placemark').forEach((pm, i) => {
    const name = pm.querySelector('name')?.textContent?.trim() || `Elemento ${i + 1}`
    const pt = pm.querySelector('Point > coordinates')?.textContent?.trim()
    const ln = pm.querySelector('LineString > coordinates')?.textContent?.trim()
    if (pt) { const [lng, lat, ele] = pt.split(',').map(Number); waypoints.push({ name, lat, lng, ele }) }
    if (ln) tracks.push({ name, coords: ln.split(/\s+/).map((c) => c.split(',').map(Number) as [number, number, number?]) })
  })
  return { waypoints, tracks }
}

export function parseGeoJson(text: string): { waypoints: Waypoint[]; tracks: TrackData[] } {
  const j = JSON.parse(text)
  const feats = j.type === 'FeatureCollection' ? j.features : [j.type === 'Feature' ? j : { type: 'Feature', geometry: j, properties: {} }]
  const waypoints: Waypoint[] = []
  const tracks: TrackData[] = []
  feats.forEach((f: { geometry?: { type: string; coordinates: number[] & number[][] }; properties?: { name?: string } }, i: number) => {
    const g = f.geometry
    const name = f.properties?.name ?? `Elemento ${i + 1}`
    if (g?.type === 'Point') waypoints.push({ name, lng: g.coordinates[0], lat: g.coordinates[1], ele: g.coordinates[2] })
    if (g?.type === 'LineString') tracks.push({ name, coords: g.coordinates as unknown as [number, number, number?][] })
  })
  return { waypoints, tracks }
}

export function parseAny(name: string, text: string) {
  const n = name.toLowerCase()
  if (n.endsWith('.gpx')) return parseGpx(text)
  if (n.endsWith('.kml')) return parseKml(text)
  return parseGeoJson(text)
}

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!)

export function toGpx(vivacs: VivacRecord[], tracks: TrackData[] = []): string {
  const w = vivacs.map((v) => `  <wpt lat="${v.lat}" lon="${v.lng}">${v.ele != null ? `<ele>${Math.round(v.ele)}</ele>` : ''}<time>${new Date(v.at).toISOString()}</time><name>${esc(v.name)}</name></wpt>`)
  const t = tracks.map((k) => `  <trk><name>${esc(k.name)}</name><trkseg>\n${k.coords.map((c) => `    <trkpt lat="${c[1]}" lon="${c[0]}">${c[2] != null ? `<ele>${Math.round(c[2])}</ele>` : ''}</trkpt>`).join('\n')}\n  </trkseg></trk>`)
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Vivac" xmlns="http://www.topografix.com/GPX/1/1">\n${[...w, ...t].join('\n')}\n</gpx>\n`
}

export function toGeoJson(vivacs: VivacRecord[], tracks: TrackData[] = []) {
  return JSON.stringify({
    type: 'FeatureCollection',
    features: [
      ...vivacs.map((v) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [v.lng, v.lat, v.ele ?? 0] }, properties: { name: v.name, at: new Date(v.at).toISOString(), sleep: v.sleep ?? null } })),
      ...tracks.map((k) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: k.coords }, properties: { name: k.name } })),
    ],
  })
}

export function download(name: string, mime: string, data: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([data], { type: mime }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}

/** Distancia (m), desnivel positivo y negativo de un track. */
export function trackStats(c: [number, number, number?][]) {
  let dist = 0, up = 0, down = 0
  for (let i = 1; i < c.length; i++) {
    const dy = (c[i][1] - c[i - 1][1]) * 111000
    const dx = (c[i][0] - c[i - 1][0]) * 111000 * Math.cos((c[i][1] * Math.PI) / 180)
    dist += Math.hypot(dx, dy)
    const dz = (c[i][2] ?? 0) - (c[i - 1][2] ?? 0)
    if (c[i][2] != null && c[i - 1][2] != null) dz > 0 ? (up += dz) : (down -= dz)
  }
  return { dist, up, down }
}
