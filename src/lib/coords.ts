export interface LL { lat: number; lng: number }

const ok = (lat: number, lng: number): LL | null => (Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0) ? { lat, lng } : null)

/** Convierte grados, minutos y segundos (con N/S/E/O) a decimal. */
function dms(s: string): number | null {
  const m = s.trim().match(/^([NSEWO])?\s*(\d{1,3})\s*[°º:\s]\s*(\d{1,2})?\s*['′:\s]?\s*(\d{1,2}(?:[.,]\d+)?)?\s*(?:"|″|'')?\s*([NSEWO])?$/i)
  if (!m) return null
  const hemi = (m[1] ?? m[5] ?? '').toUpperCase()
  let v = Number(m[2]) + (m[3] ? Number(m[3]) / 60 : 0) + (m[4] ? Number(m[4].replace(',', '.')) / 3600 : 0)
  if (hemi === 'S' || hemi === 'W' || hemi === 'O') v = -v
  return v
}

/**
 * Lee coordenadas de un texto o enlace: «40.8232, -3.9624», «40.82327 N 3.96243 O», «40°49'23"N 3°57'45"O»,
 * enlaces de Google Maps (@lat,lng · q=lat,lng · ll=), OpenStreetMap (#map=z/lat/lng · mlat/mlon) y geo:lat,lng.
 */
export function parseCoords(text: string): LL | null {
  const t = decodeURIComponent(text.trim().replace(/\+/g, ' '))
  let m = t.match(/@(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/) // Google @lat,lng
  if (m) return ok(+m[1], +m[2])
  m = t.match(/[?&](?:q|ll|query|destination|center)=(-?\d{1,2}\.\d+)[, ]\s*(-?\d{1,3}\.\d+)/)
  if (m) return ok(+m[1], +m[2])
  m = t.match(/#map=\d+\/(-?\d{1,2}\.\d+)\/(-?\d{1,3}\.\d+)/) // OpenStreetMap
  if (m) return ok(+m[1], +m[2])
  m = t.match(/mlat=(-?\d{1,2}\.\d+).*?mlon=(-?\d{1,3}\.\d+)/)
  if (m) return ok(+m[1], +m[2])
  m = t.match(/geo:(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/)
  if (m) return ok(+m[1], +m[2])
  m = t.match(/!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/) // Google, enlace largo
  if (m) return ok(+m[1], +m[2])
  // Decimal con hemisferio: 40.82327 N, 3.96243 O
  m = t.match(/(\d{1,2}[.,]\d+)\s*°?\s*([NS])[\s,;]+(\d{1,3}[.,]\d+)\s*°?\s*([EWO])/i)
  if (m) return ok((m[2].toUpperCase() === 'S' ? -1 : 1) * +m[1].replace(',', '.'), (/[WO]/i.test(m[4]) ? -1 : 1) * +m[3].replace(',', '.'))
  // Grados, minutos y segundos
  const parts = t.split(/[,;]|\s{2,}|(?<=[NSns])\s+(?=[\dEWOewo])/)
  if (parts.length === 2) {
    const a = dms(parts[0]), b = dms(parts[1])
    if (a != null && b != null) return ok(a, b)
  }
  // Decimal simple: 40.82327, -3.96243  o  40.82327 -3.96243
  m = t.match(/(-?\d{1,2}[.,]\d+)[\s,;]+(-?\d{1,3}[.,]\d+)/)
  if (m) return ok(+m[1].replace(',', '.'), +m[2].replace(',', '.'))
  return null
}

/** Dentro de la zona de la app (sierra y alrededores)? Si no, avisamos pero no bloqueamos. */
export const inSierra = (p: LL) => p.lat > 40.3 && p.lat < 41.3 && p.lng > -4.9 && p.lng < -3.3

/** Grados decimales a UTM (ETRS89 / huso 30N): útil para hablar con rescates y mapas topográficos. */
export function toUTM(lat: number, lng: number): { zone: number; band: string; e: number; n: number } {
  const a = 6378137, f = 1 / 298.257222101, k0 = 0.9996
  const zone = Math.floor((lng + 180) / 6) + 1
  const lon0 = ((zone - 1) * 6 - 180 + 3) * (Math.PI / 180)
  const phi = (lat * Math.PI) / 180, lam = (lng * Math.PI) / 180
  const e2 = f * (2 - f), ep2 = e2 / (1 - e2)
  const N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2)
  const T = Math.tan(phi) ** 2, C = ep2 * Math.cos(phi) ** 2, A = Math.cos(phi) * (lam - lon0)
  const M = a * ((1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * phi - ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * phi) + ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * phi) - ((35 * e2 ** 3) / 3072) * Math.sin(6 * phi))
  const e = k0 * N * (A + ((1 - T + C) * A ** 3) / 6 + ((5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * A ** 5) / 120) + 500000
  let n = k0 * (M + N * Math.tan(phi) * (A ** 2 / 2 + ((5 - T + 9 * C + 4 * C ** 2) * A ** 4) / 24 + ((61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * A ** 6) / 720))
  if (lat < 0) n += 10000000
  return { zone, band: 'SRQPNMLKJHGFEDCXWVUTS'.charAt(Math.floor((lat + 80) / 8)) || 'T', e: Math.round(e), n: Math.round(n) }
}

/** Grados, minutos y segundos para leer por radio. */
export function toDMS(v: number, pos: string, neg: string): string {
  const s = v >= 0 ? pos : neg
  const a = Math.abs(v)
  const d = Math.floor(a), m = Math.floor((a - d) * 60), sec = ((a - d) * 60 - m) * 60
  return `${d}° ${String(m).padStart(2, '0')}′ ${sec.toFixed(1)}″ ${s}`
}
