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
  const hs = cell.hours.filter((h) => h.t >= night.from.getTime() && h.t <= night.to.getTime())
  if (hs.length < 3) return null
  const dz = (p.ele ?? cell.elev) - cell.elev
  const adj = (h: Hour) => h.temp - 0.0065 * dz
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
  const windMean = hs.reduce((a, h) => a + h.wind, 0) / hs.length
  const feels = Math.min(...hs.map((h) => windChill(adj(h), h.wind * sh.wind)))
  return {
    tmin,
    feels,
    windMean,
    gustMax: Math.max(...hs.map((h) => h.gust)),
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
    series: hs.map((h, i) => ({ t: h.t, temp: temps[i], wind: h.wind, gust: h.gust, dir: h.dir, precip: h.precip })),
  }
}

export interface ScoreCtx {
  /** Temperatura de sensación mínima con la que el grupo duerme bien (se aprende en la mochila). */
  threshold: number
  /** Salir a esa hora (min desde las 00:00) obliga a llegar de noche. */
  arriveDark?: boolean
}
export interface Score {
  score: number
  level: 'verde' | 'ambar' | 'rojo'
  parts: { frio: number; viento: number; lluvia: number; extra: number }
  shelter: Shelter
}

const lerp = (v: number, lo: number, hi: number) => Math.max(0, Math.min(1, (v - lo) / (hi - lo)))

export function scoreNight(p: Place, s: NightStats, ctx: ScoreCtx): Score {
  const sh = shelterFor(p, s.dir)
  const frio = 100 * lerp(s.feels, ctx.threshold - 8, ctx.threshold + 8)
  const gustEff = s.gustMax * sh.wind
  const viento = 100 * (1 - lerp(gustEff, 15, 65))
  const wet = s.precip * sh.rain + (s.snow * 2 * sh.rain)
  const lluvia = 100 * (1 - lerp(wet, 0, 5))
  let extra = 100
  if (s.fogHours > 3 && !sh.covered) extra -= 12
  if (ctx.arriveDark) extra -= 20
  if (s.snowDepth > 0.05 && (p.ele ?? 0) > 1500) extra -= 15
  if (s.rhMax > 95 && s.tmin < 2 && !sh.covered) extra -= 8 // escarcha / rocío
  extra = Math.max(0, extra)

  let score = 0.4 * frio + 0.3 * viento + 0.3 * lluvia
  // Un solo fallo gordo hunde la noche aunque lo demás vaya bien.
  score = Math.min(score, Math.min(frio, viento, lluvia) + 35)
  score -= (100 - extra) * 0.3
  if (s.thunder) score = Math.min(score, sh.covered ? 60 : 25)
  score = Math.round(Math.max(0, Math.min(100, score)))
  return { score, level: score >= 70 ? 'verde' : score >= 45 ? 'ambar' : 'rojo', parts: { frio, viento, lluvia, extra }, shelter: sh }
}

export const LEVEL_COLOR = { verde: '#3f8a68', ambar: '#e5b23a', rojo: '#d1553f' } as const

export function moonInfo(date: Date) {
  const m = SunCalc.getMoonIllumination(date)
  const f = m.fraction
  const name = f < 0.06 ? 'luna nueva' : f > 0.94 ? 'luna llena' : m.phase < 0.5 ? (f < 0.5 ? 'luna creciente' : 'creciente gibosa') : f < 0.5 ? 'luna menguante' : 'menguante gibosa'
  return { fraction: f, phase: m.phase, name }
}
