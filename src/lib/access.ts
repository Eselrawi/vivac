import { haversine } from './geo'
import { walkTimeMin } from './router'
import type { Place } from './types'
import type { Prefs } from './prefs'

export interface DriveRow { min: number; km: number }
export type DriveTable = Record<string, DriveRow>

/** Minutos a pie (norma DIN 33466: 4 km/h, 300 m/h subiendo, 500 m/h bajando; recto ×1,3 por el trazado real). */
export function walkMin(from: Pick<Place, 'lat' | 'lng' | 'ele'>, to: Pick<Place, 'lat' | 'lng' | 'ele'>): { min: number; km: number } {
  const dist = haversine(from.lat, from.lng, to.lat, to.lng) * 1.3
  const dz = (to.ele ?? 0) - (from.ele ?? 0)
  return { min: walkTimeMin(dist, Math.max(0, dz), Math.max(0, -dz)), km: dist / 1000 }
}

export interface AccessOption {
  parking: Place
  driveMin: number
  driveKm: number
  walkMin: number
  walkKm: number
  totalMin: number
}

export function accessFor(place: Place, parkings: Place[], drive: DriveTable, maxAlt = 3): AccessOption[] {
  const opts: AccessOption[] = []
  for (const k of parkings) {
    const d = drive[k.id]
    if (!d) continue
    if (haversine(place.lat, place.lng, k.lat, k.lng) > 16000) continue
    const w = walkMin(k, place)
    opts.push({ parking: k, driveMin: d.min, driveKm: d.km, walkMin: w.min, walkKm: w.km, totalMin: d.min + w.min })
  }
  opts.sort((a, b) => a.totalMin - b.totalMin)
  return opts.slice(0, maxAlt)
}

/** Aparcamientos propios son el propio sitio: un parking no necesita aparcar. */
export const isDriveable = (p: Place) => p.kind === 'parking'

export function leaveBy(sunset: Date, a: AccessOption, prefs: Prefs): Date {
  return new Date(sunset.getTime() - (prefs.marginMin + a.totalMin) * 60000)
}

export const hhmm = (d: Date) => d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })

export function fuelCost(a: AccessOption, prefs: Prefs): { total: number; perPerson: number } {
  const total = a.driveKm * 2 * (prefs.consumption / 100) * prefs.fuelPrice
  return { total, perPerson: total / Math.max(1, prefs.people) }
}

const PASS = /navacerrada|cotos|morcuera|canencia|castillas|quitanieves|navafr/i
export const DGT_URL = 'https://infocar.dgt.es/etraffic/'
export const isPass = (p: Place) => PASS.test(p.name)
