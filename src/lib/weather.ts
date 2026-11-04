import { useCallback, useEffect, useState } from 'react'
import { db } from './db'
import type { Place } from './types'

export interface Hour {
  t: number // ms UTC
  temp: number
  wind: number // km/h
  gust: number
  dir: number // grados DESDE donde sopla
  precip: number // mm/h
  snow: number // cm/h
  code: number
  cloud: number // %
  rh: number // %
  cape: number
  snowDepth: number // m
  spread: number // diferencia máxima entre modelos (°C)
  n: number // modelos con datos
}
export interface Cell { key: string; lat: number; lng: number; elev: number; hours: Hour[] }
export interface WxStore { fetchedAt: number; days: number; cells: Record<string, Cell> }

const STEP = 0.2
export const cellKey = (lat: number, lng: number) => `${Math.floor(lat / STEP)}_${Math.floor(lng / STEP)}`
const MODELS = ['ecmwf_ifs025', 'icon_seamless', 'meteofrance_seamless']
const VARS = ['temperature_2m', 'wind_speed_10m', 'wind_gusts_10m', 'wind_direction_10m', 'precipitation', 'snowfall', 'weather_code', 'cloud_cover', 'relative_humidity_2m', 'cape', 'snow_depth']

type Raw = Record<string, (number | null)[]>
const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN)

function merge(raw: Raw, i: number): Hour | null {
  const get = (name: string) => MODELS.map((m) => raw[`${name}_${m}`]?.[i]).filter((x): x is number => typeof x === 'number')
  const temps = get('temperature_2m')
  if (!temps.length) return null
  const dirs = get('wind_direction_10m')
  const sx = mean(dirs.map((d) => Math.sin((d * Math.PI) / 180)))
  const cx = mean(dirs.map((d) => Math.cos((d * Math.PI) / 180)))
  const codes = get('weather_code')
  return {
    t: (raw.time[i] as number) * 1000,
    temp: mean(temps),
    wind: mean(get('wind_speed_10m')) || 0,
    gust: mean(get('wind_gusts_10m')) || 0,
    dir: dirs.length ? ((Math.atan2(sx, cx) * 180) / Math.PI + 360) % 360 : 0,
    precip: mean(get('precipitation')) || 0,
    snow: mean(get('snowfall')) || 0,
    code: codes.length ? Math.max(...codes) : 0,
    cloud: mean(get('cloud_cover')) || 0,
    rh: mean(get('relative_humidity_2m')) || 0,
    cape: mean(get('cape')) || 0,
    snowDepth: mean(get('snow_depth')) || 0,
    spread: temps.length > 1 ? Math.max(...temps) - Math.min(...temps) : 0,
    n: temps.length,
  }
}

export function cellsFor(places: Place[]) {
  const m = new Map<string, { key: string; lat: number; lng: number; eles: number[] }>()
  for (const p of places) {
    const key = cellKey(p.lat, p.lng)
    const c = m.get(key) ?? { key, lat: (Math.floor(p.lat / STEP) + 0.5) * STEP, lng: (Math.floor(p.lng / STEP) + 0.5) * STEP, eles: [] }
    if (p.ele) c.eles.push(p.ele)
    m.set(key, c)
  }
  return [...m.values()]
}

export async function fetchWeather(places: Place[], days = 10): Promise<WxStore> {
  const cs = cellsFor(places)
  const elev = cs.map((c) => Math.round(c.eles.length ? c.eles.sort((a, b) => a - b)[Math.floor(c.eles.length / 2)] : 1500))
  const qs = new URLSearchParams({
    latitude: cs.map((c) => c.lat.toFixed(3)).join(','),
    longitude: cs.map((c) => c.lng.toFixed(3)).join(','),
    elevation: elev.join(','),
    hourly: VARS.join(','),
    models: MODELS.join(','),
    timezone: 'Europe/Madrid',
    timeformat: 'unixtime',
    forecast_days: String(days),
    wind_speed_unit: 'kmh',
  })
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?${qs}`)
  if (!r.ok) throw new Error(`Open-Meteo ${r.status}`)
  const j = await r.json()
  const arr: Array<{ elevation: number; hourly: Raw }> = Array.isArray(j) ? j : [j]
  const cells: Record<string, Cell> = {}
  arr.forEach((loc, k) => {
    const hours: Hour[] = []
    for (let i = 0; i < loc.hourly.time.length; i++) {
      const h = merge(loc.hourly, i)
      if (h) hours.push(h)
    }
    cells[cs[k].key] = { key: cs[k].key, lat: cs[k].lat, lng: cs[k].lng, elev: loc.elevation ?? elev[k], hours }
  })
  return { fetchedAt: Date.now(), days, cells }
}

const STALE = 3 * 3600 * 1000

export function useWeather(places: Place[]) {
  const [wx, setWx] = useState<WxStore | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const key = places.length

  const refresh = useCallback(async () => {
    if (!places.length) return
    setLoading(true)
    setError(false)
    try {
      const w = await fetchWeather(places)
      setWx(w)
      await db.kv.put({ k: 'wx', v: w })
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => {
    if (!places.length) return
    let live = true
    db.kv.get('wx').then((row) => {
      const cached = row?.v as WxStore | undefined
      if (cached && live) setWx(cached)
      if ((!cached || Date.now() - cached.fetchedAt > STALE) && navigator.onLine) void refresh()
    })
    const on = () => void refresh()
    window.addEventListener('online', on)
    return () => { live = false; window.removeEventListener('online', on) }
  }, [key, refresh, places.length])

  return { wx, loading, error, refresh }
}

/** Tiempo que hizo de verdad esa noche (archivo histórico de Open-Meteo; los últimos días vienen de la previsión con datos pasados). */
export async function nightActual(lat: number, lng: number, ele: number | null | undefined, atMs: number): Promise<import('./db').NightWx | null> {
  const day = new Date(atMs)
  const iso = (d: Date) => d.toLocaleDateString('sv-SE')
  const next = new Date(atMs + 86400000)
  const old = Date.now() - atMs > 6 * 86400000
  const base = old ? 'https://archive-api.open-meteo.com/v1/archive' : 'https://api.open-meteo.com/v1/forecast'
  const qs = new URLSearchParams({
    latitude: lat.toFixed(4), longitude: lng.toFixed(4),
    hourly: 'temperature_2m,wind_speed_10m,precipitation,cloud_cover',
    timezone: 'Europe/Madrid', timeformat: 'unixtime', wind_speed_unit: 'kmh',
    ...(ele != null ? { elevation: String(Math.round(ele)) } : {}),
    ...(old ? { start_date: iso(day), end_date: iso(next) } : { past_days: '7', forecast_days: '1' }),
  })
  const r = await fetch(`${base}?${qs}`)
  if (!r.ok) return null
  const j = await r.json()
  const t: number[] = j.hourly.time
  const from = atMs - 2 * 3600000
  const to = atMs + 12 * 3600000
  const idx = t.map((x, i) => (x * 1000 >= from && x * 1000 <= to ? i : -1)).filter((i) => i >= 0)
  const col = (k: string) => idx.map((i) => j.hourly[k][i]).filter((v: number | null) => v != null) as number[]
  const temps = col('temperature_2m')
  if (!temps.length) return null
  const wind = col('wind_speed_10m'), pr = col('precipitation'), cl = col('cloud_cover')
  return { tmin: Math.min(...temps), tmax: Math.max(...temps), windMax: Math.max(...wind), precip: pr.reduce((a, b) => a + b, 0), cloud: cl.length ? cl.reduce((a, b) => a + b, 0) / cl.length : 0, src: 'real' }
}
