import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { db } from './db'
import { haversine } from './geo'
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

export function useDrive(prefs: Prefs, parkings: Place[]): DriveTable {
  const [base, setBase] = useState<DriveTable>({})
  const [live, setLive] = useState<DriveTable | null>(null)
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/drive.json`).then((r) => r.json()).then((j) => setBase(j.table)).catch(() => {})
  }, [])
  const custom = Math.abs(prefs.homeLat - 40.4436) > 0.002 || Math.abs(prefs.homeLng + 3.9944) > 0.002
  useEffect(() => {
    if (!custom || !parkings.length) { setLive(null); return }
    const key = `drive:${prefs.homeLat.toFixed(3)},${prefs.homeLng.toFixed(3)}`
    let alive = true
    db.kv.get(key).then(async (row) => {
      if (row && alive) { setLive(row.v as DriveTable); return }
      if (!navigator.onLine) return
      try {
        const coords = [{ lat: prefs.homeLat, lng: prefs.homeLng }, ...parkings].map((q) => `${q.lng},${q.lat}`).join(';')
        const dst = parkings.map((_, i) => i + 1).join(';')
        const r = await fetch(`https://router.project-osrm.org/table/v1/driving/${coords}?sources=0&destinations=${dst}&annotations=duration,distance`)
        const j = await r.json()
        const t: DriveTable = {}
        parkings.forEach((q, i) => { if (j.durations?.[0]?.[i] != null) t[q.id] = { min: Math.round(j.durations[0][i] / 60), km: +(j.distances[0][i] / 1000).toFixed(1) } })
        await db.kv.put({ k: key, v: t })
        if (alive) setLive(t)
      } catch { /* sin red: usamos estimación */ }
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [custom, prefs.homeLat, prefs.homeLng, parkings.length])
  return useMemo(() => {
    if (!custom) return base
    if (live) return live
    // Estimación en línea recta (×1,4 de curvas, 55 km/h de media) hasta tener la ruta real.
    const t: DriveTable = {}
    for (const q of parkings) { const km = (haversine(prefs.homeLat, prefs.homeLng, q.lat, q.lng) / 1000) * 1.4; t[q.id] = { min: Math.round((km / 55) * 60), km: +km.toFixed(1) } }
    return t
  }, [custom, base, live, parkings, prefs.homeLat, prefs.homeLng])
}

// ---- Ediciones locales de un sitio (orientación del parapeto, tipo de protección) ----
type Ovr = Record<string, Partial<Pick<Place, 'shelteredFrom' | 'shelter' | 'priceNight' | 'verified'>>>
const KEY = 'vivac.ovr'
let ovr: Ovr = JSON.parse(localStorage.getItem(KEY) ?? '{}')
const subs = new Set<() => void>()
export const setOverride = (id: string, patch: Ovr[string]) => {
  ovr = { ...ovr, [id]: { ...ovr[id], ...patch } }
  localStorage.setItem(KEY, JSON.stringify(ovr))
  subs.forEach((f) => f())
}
export const useOverrides = () => useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb) }, () => ovr)
