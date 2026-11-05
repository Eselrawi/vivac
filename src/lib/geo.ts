const R = 6371000
const rad = (d: number) => (d * Math.PI) / 180

export function haversine(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = rad(bLat - aLat)
  const dLng = rad(bLng - aLng)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

export function bearing(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const y = Math.sin(rad(bLng - aLng)) * Math.cos(rad(bLat))
  const x = Math.cos(rad(aLat)) * Math.sin(rad(bLat)) - Math.sin(rad(aLat)) * Math.cos(rad(bLat)) * Math.cos(rad(bLng - aLng))
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO']
/** Rumbo en castellano (O = oeste). `deg` = dirección DESDE donde sopla. */
export const compass = (deg: number) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16]

/** Diferencia angular mínima entre dos rumbos (0–180). */
export const angDiff = (a: number, b: number) => {
  const d = Math.abs((((a - b) % 360) + 540) % 360 - 180)
  return d
}

export const fmtDur = (min: number) => {
  const m = Math.max(0, Math.round(min))
  const h = Math.floor(m / 60)
  const r = m % 60
  return h === 0 ? `${r} min` : r === 0 ? `${h} h` : `${h} h ${String(r).padStart(2, '0')} min`
}

/** Distancia lateral (m) de un punto a una línea [lng, lat, …] y metros recorridos hasta su proyección. */
export function projectOnLine(line: ArrayLike<number | undefined>[], lat: number, lng: number): { d: number; along: number; total: number } {
  const k = Math.cos((lat * Math.PI) / 180) * 111320
  let best = Infinity, along = 0, acc = 0
  for (let i = 1; i < line.length; i++) {
    const ax = ((line[i - 1][0] as number) - lng) * k, ay = ((line[i - 1][1] as number) - lat) * 111320
    const bx = ((line[i][0] as number) - lng) * k, by = ((line[i][1] as number) - lat) * 111320
    const dx = bx - ax, dy = by - ay
    const l2 = dx * dx + dy * dy
    const t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0
    const d = Math.hypot(ax + t * dx, ay + t * dy)
    const seg = Math.sqrt(l2)
    if (d < best) { best = d; along = acc + t * seg }
    acc += seg
  }
  return { d: best, along, total: acc }
}
