import * as SunCalc from 'suncalc'
import { angDiff } from './geo'
import type { Cell, Hour } from './weather'
import type { Place } from './types'

export interface NightStats {
  tmin: number
  feels: number // sensación con el viento ya filtrado por la protección del sitio
  windMean: number
  gustMax: number
  dir: number
  precip: number // mm esperados en la noche
  snow: number // cm
  thunder: boolean
  fogHours: number
  cloud: number
  rhMax: number
  snowDepth: number
  spread: number
  models: number
  hours: number
  series: Array<{ t: number; temp: number; wind: number; gust: number; dir: number; precip: number }>
}

export interface Shelter { wind: number; rain: number; label: string; covered: boolean }

/** Cuánto viento y lluvia te llega realmente según el tipo de sitio y de dónde sopla. */
export function shelterFor(p: Pick<Place, 'shelter' | 'shelteredFrom' | 'kind'>, dir: number): Shelter {
  const s = p.shelter ?? (p.kind === 'refugio_libre' || p.kind === 'refugio_pago' ? 'cerrado' : 'raso')
  if (s === 'cerrado') return { wind: 0.08, rain: 0, label: 'protección total', covered: true }
  if (s === 'techo') return { wind: 0.35, rain: 0.1, label: 'tiene techo', covered: true }
  if (s === 'parapeto') {
    const from = p.shelteredFrom ?? []
    if (!from.length) return { wind: 0.65, rain: 1, label: 'parapeto (orientación sin confirmar)', covered: false }
    const ok = from.some((f) => angDiff(f, dir) <= 33)
    return ok
      ? { wind: 0.3, rain: 1, label: 'el parapeto te cubre de ese viento', covered: false }
      : { wind: 0.95, rain: 1, label: 'el viento entra por la abertura', covered: false }
  }
  const from = p.shelteredFrom ?? []
  if (from.length) {
    const ok = from.some((f) => angDiff(f, dir) <= 33)
    return ok ? { wind: 0.6, rain: 1, label: 'el relieve te resguarda un poco de ese viento', covered: false } : { wind: 1, rain: 1, label: 'al raso', covered: false }
  }
  return { wind: 1, rain: 1, label: 'al raso', covered: false }
}

/** Sensación térmica (JAG/TI) con el viento que llega de verdad. */
export function windChill(t: number, v: number): number {
  if (t > 10 || v < 4.8) return t
  const p = v ** 0.16
  return 13.12 + 0.6215 * t - 11.37 * p + 0.3965 * t * p
}

export interface Night {
  sunset: Date
  sunrise: Date
  from: Date
  to: Date
}

/** Noche que empieza en `day` (tarde) y acaba al amanecer del día siguiente, para ESE sitio. */
export function nightFor(day: Date, lat: number, lng: number, ele = 0): Night {
  const d0 = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12)
  const d1 = new Date(d0.getTime() + 86400000)
  const a = SunCalc.getTimes(d0, lat, lng)
  const b = SunCalc.getTimes(d1, lat, lng)
  void ele
  const sunset = a.sunset ?? new Date(d0.getTime() + 6 * 3600000)
  const sunrise = b.sunrise ?? new Date(d1.getTime() - 5 * 3600000)
  return { sunset, sunrise, from: new Date(sunset.getTime() + 3600000), to: sunrise }
}

export function statsFor(cell: Cell | undefined, p: Place, night: Night): NightStats | null {
  if (!cell) return null
  const a = night.from.getTime(), b = night.to.getTime()
  const H = cell.hours
  let lo = 0, hi = H.length
  while (lo < hi) { const m = (lo + hi) >> 1; if (H[m].t < a) lo = m + 1; else hi = m }
  let end = lo
  while (end < H.length && H[end].t <= b) end++
  const hs = H.slice(lo, end)
  if (hs.length < 3) return null
  const dz = (p.ele ?? cell.elev) - cell.elev
  // Relieve: las crestas reciben más viento; en los valles, las noches despejadas y en calma acumulan aire frío (inversión térmica).
  const tpi = p.tpi ?? 0
  const windK = 1 + Math.max(-0.2, Math.min(0.45, tpi / 220))
  const inversion = (h: Hour) => (h.cloud < 35 && h.wind < 12 ? (tpi < -30 ? -Math.min(3.5, (-tpi - 30) / 35) : tpi > 60 ? 0.8 : 0) : 0)
  const adj = (h: Hour) => h.temp - 0.0065 * dz + inversion(h)
  const temps = hs.map(adj)
  const tmin = Math.min(...temps)
  const dir = Math.round(
    ((Math.atan2(
      hs.reduce((a, h) => a + h.wind * Math.sin((h.dir * Math.PI) / 180), 0),
      hs.reduce((a, h) => a + h.wind * Math.cos((h.dir * Math.PI) / 180), 0),
    ) *
      180) /
      Math.PI +
      360) %
      360,
  )
  const sh = shelterFor(p, dir)
  const windMean = (hs.reduce((a, h) => a + h.wind, 0) / hs.length) * windK
  const feels = Math.min(...hs.map((h) => windChill(adj(h), h.wind * windK * sh.wind)))
  return {
    tmin,
    feels,
    windMean,
    gustMax: Math.max(...hs.map((h) => h.gust)) * windK,
    dir,
    precip: hs.reduce((a, h) => a + h.precip, 0),
    snow: hs.reduce((a, h) => a + h.snow, 0),
    thunder: hs.some((h) => h.code >= 95 || h.cape > 800),
    fogHours: hs.filter((h) => h.code === 45 || h.code === 48).length,
    cloud: hs.reduce((a, h) => a + h.cloud, 0) / hs.length,
    rhMax: Math.max(...hs.map((h) => h.rh)),
    snowDepth: Math.max(...hs.map((h) => h.snowDepth)),
    spread: Math.max(...hs.map((h) => h.spread)),
    models: Math.min(...hs.map((h) => h.n)),
    hours: hs.length,
    series: hs.map((h, i) => ({ t: h.t, temp: temps[i], wind: h.wind * windK, gust: h.gust * windK, dir: h.dir, precip: h.precip })),
  }
}

export type NightMode = 'comoda' | 'aventura' | 'estrellas'
export const MODE_LABEL: Record<NightMode, string> = { comoda: 'Cómoda', aventura: 'Aventura', estrellas: 'Estrellas' }

export interface ScoreCtx {
  /** Temperatura de sensación mínima con la que el grupo duerme bien (se aprende en la mochila). */
  threshold: number
  /** Llegar de noche resta. */
  arriveDark?: boolean
  mode?: NightMode
  walkMin?: number
  driveMin?: number
  /** Nieve o hielo esperables en el aparcamiento. */
  accessSnow?: boolean
  /** Calidad del sitio 0–100 (cuánta evidencia hay de que existe y su estado). */
  quality?: number
  /** Fracción de «me gusta» del grupo 0–1. */
  like?: number
  /** Fracción iluminada de la luna 0–1 (para la noche de estrellas). */
  moon?: number
}
export interface Parts { tiempo: number; proteccion: number; acceso: number; calidad: number; extra: number; megusta: number }
export interface Score {
  score: number
  level: 'verde' | 'ambar' | 'rojo'
  parts: Parts
  shelter: Shelter
  mode: NightMode
}

const lerp = (v: number, lo: number, hi: number) => Math.max(0, Math.min(1, (v - lo) / (hi - lo)))
const WEIGHTS: Record<NightMode, Record<'tiempo' | 'proteccion' | 'acceso' | 'calidad' | 'extra', number>> = {
  comoda: { tiempo: 0.35, proteccion: 0.3, acceso: 0.2, calidad: 0.15, extra: 0 },
  aventura: { tiempo: 0.2, proteccion: 0.15, acceso: 0.1, calidad: 0.15, extra: 0.4 },
  estrellas: { tiempo: 0.2, proteccion: 0.2, acceso: 0.1, calidad: 0.1, extra: 0.4 },
}

/** Nota 0–100 por partes (tiempo, protección, acceso, calidad del sitio) y según el tipo de noche. */
export function scoreNight(p: Place, s: NightStats, ctx: ScoreCtx): Score {
  const mode = ctx.mode ?? 'comoda'
  const sh = shelterFor(p, s.dir)
  const frio = 100 * lerp(s.feels, ctx.threshold - 8, ctx.threshold + 8)
  const wet = s.precip * sh.rain + s.snow * 2 * sh.rain
  const lluvia = 100 * (1 - lerp(wet, 0, 5))
  const tiempo = 0.62 * frio + 0.38 * lluvia

  let proteccion = 100 * (1 - lerp(s.gustMax * sh.wind, 15, 65))
  if (s.fogHours > 3 && !sh.covered) proteccion -= 12
  if (s.rhMax > 95 && s.tmin < 2 && !sh.covered) proteccion -= 8 // rocío o escarcha
  proteccion = Math.max(0, proteccion)

  let acceso = 100
  if (ctx.arriveDark) acceso -= 35
  const w = ctx.walkMin ?? 0
  acceso -= w > 180 ? 35 : w > 120 ? 20 : w > 75 ? 8 : 0
  if ((ctx.driveMin ?? 0) > 150) acceso -= 10
  if (ctx.accessSnow) acceso -= 20
  if (s.snowDepth > 0.05 && (p.ele ?? 0) > 1500) acceso -= 15
  acceso = Math.max(0, acceso)

  const calidad = ctx.quality ?? 100

  // Parte propia de cada tipo de noche. Así no gana siempre el sitio más bajo y resguardado.
  let extra = 0
  if (mode === 'aventura') extra = 100 * (0.7 * lerp(p.ele ?? 1200, 1300, 2200) + 0.3 * lerp(p.tpi ?? 0, -20, 80))
  if (mode === 'estrellas') extra = 100 * (0.45 * (1 - s.cloud / 100) + 0.25 * (1 - (ctx.moon ?? 0.5)) + 0.15 * (1 - lerp(s.rhMax, 60, 100)) + 0.15 * lerp(p.ele ?? 1200, 1000, 2200)) - (s.fogHours > 2 ? 20 : 0)
  extra = Math.max(0, Math.min(100, extra))

  const W = WEIGHTS[mode]
  let score = W.tiempo * tiempo + W.proteccion * proteccion + W.acceso * acceso + W.calidad * calidad + W.extra * extra
  // Un fallo gordo de tiempo o viento hunde la noche aunque lo demás vaya bien.
  score = Math.min(score, Math.min(tiempo, proteccion) + 35)
  if (s.thunder) score = Math.min(score, sh.covered ? 60 : 25)
  score += 8 * (ctx.like ?? 0)
  score = Math.round(Math.max(0, Math.min(100, score)))
  return { score, level: score >= 70 ? 'verde' : score >= 45 ? 'ambar' : 'rojo', parts: { tiempo, proteccion, acceso, calidad, extra, megusta: 100 * (ctx.like ?? 0) }, shelter: sh, mode }
}

export const LEVEL_COLOR = { verde: '#3f8a68', ambar: '#e5b23a', rojo: '#d1553f' } as const

export function moonInfo(date: Date) {
  const m = SunCalc.getMoonIllumination(date)
  const f = m.fraction
  const name = f < 0.06 ? 'luna nueva' : f > 0.94 ? 'luna llena' : m.phase < 0.5 ? (f < 0.5 ? 'luna creciente' : 'creciente gibosa') : f < 0.5 ? 'luna menguante' : 'menguante gibosa'
  return { fraction: f, phase: m.phase, name }
}
