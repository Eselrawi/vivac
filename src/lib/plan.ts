import { useEffect, useState } from 'react'
import { useSyncExternalStore } from 'react'
import { accessFor, fuelCost, leaveBy, type AccessOption, type DriveTable } from './access'
import { confidence, phrase } from './phrase'
import { moonInfo, nightFor, scoreNight, statsFor, type Night, type NightStats, type Score } from './score'
import type { Prefs } from './prefs'
import { cellKey, type WxStore } from './weather'
import type { Place } from './types'

export interface Entry {
  place: Place
  night: Night
  stats: NightStats
  score: Score
  text: string
  conf: ReturnType<typeof confidence>
  access: AccessOption[]
  leave: Date | null
  cost: { total: number; perPerson: number } | null
  moon: ReturnType<typeof moonInfo>
}

export interface Ctx {
  wx: WxStore | null
  parkings: Place[]
  drive: DriveTable
  prefs: Prefs
}

/** Evalúa una noche concreta en un sitio. Devuelve null si aún no hay previsión para ese día. */
export function evaluate(place: Place, day: Date, ctx: Ctx, pickedParking?: string): Entry | null {
  if (!ctx.wx) return null
  const night = nightFor(day, place.lat, place.lng, place.ele)
  const stats = statsFor(ctx.wx.cells[cellKey(place.lat, place.lng)], place, night)
  if (!stats) return null
  const access = accessFor(place, ctx.parkings, ctx.drive)
  if (pickedParking) {
    const i = access.findIndex((a) => a.parking.id === pickedParking)
    if (i > 0) access.unshift(...access.splice(i, 1))
  }
  const best = access[0]
  const leave = best ? leaveBy(night.sunset, best, ctx.prefs) : null
  // Salir antes de las 11:00 para llegar con luz es poco realista: contamos llegada de noche.
  const arriveDark = leave ? leave.getHours() < 11 : false
  const score = scoreNight(place, stats, { threshold: ctx.prefs.threshold - ctx.prefs.coldMargin, arriveDark })
  return {
    place, night, stats, score,
    text: phrase(stats, score, new Date(night.sunset.getTime() + 6 * 3600000)),
    conf: confidence(stats),
    access, leave,
    cost: best ? fuelCost(best, ctx.prefs) : null,
    moon: moonInfo(new Date(night.sunset.getTime() + 6 * 3600000)),
  }
}

export function useDays(n = 10) {
  const [days] = useState(() => {
    const out: Date[] = []
    for (let i = 0; i < n; i++) {
      const d = new Date()
      d.setDate(d.getDate() + i)
      d.setHours(12, 0, 0, 0)
      out.push(d)
    }
    return out
  })
  return days
}

export function useDrive(): DriveTable {
  const [t, setT] = useState<DriveTable>({})
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/drive.json`).then((r) => r.json()).then((j) => setT(j.table)).catch(() => {})
  }, [])
  return t
}

// ---- Ediciones locales de un sitio (orientación del parapeto, tipo de protección) ----
type Ovr = Record<string, Partial<Pick<Place, 'shelteredFrom' | 'shelter' | 'priceNight'>>>
const KEY = 'vivac.ovr'
let ovr: Ovr = JSON.parse(localStorage.getItem(KEY) ?? '{}')
const subs = new Set<() => void>()
export const setOverride = (id: string, patch: Ovr[string]) => {
  ovr = { ...ovr, [id]: { ...ovr[id], ...patch } }
  localStorage.setItem(KEY, JSON.stringify(ovr))
  subs.forEach((f) => f())
}
export const useOverrides = () => useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb) }, () => ovr)
