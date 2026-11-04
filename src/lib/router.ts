import { useCallback, useEffect, useRef, useState } from 'react'

export type Profile = 'directo' | 'noche'
export interface RouteResult {
  ok: true
  coords: [number, number, number][] // lng, lat, ele
  dist: number
  asc: number
  desc: number
  profile: [number, number][] // [metros acumulados, altitud]
  snapStart: number
  snapEnd: number
}
export type RouteOut = RouteResult | { ok: false; error: string }

/** Tiempo de marcha (norma DIN 33466, la que usa la montaña en Europa): 4 km/h en llano, 300 m/h subiendo y 500 m/h bajando. */
export function walkTimeMin(distM: number, asc: number, desc: number): number {
  const h = distM / 1000 / 4
  const v = asc / 300 + desc / 500
  return (Math.max(h, v) + Math.min(h, v) / 2) * 60
}

let worker: Worker | null = null
let ready: Promise<void> | null = null
let seq = 0
const pending = new Map<number, (r: RouteOut) => void>()

function ensure(): Promise<void> {
  if (ready) return ready
  worker = new Worker(new URL('./router.worker.ts', import.meta.url), { type: 'module' })
  ready = new Promise((res) => {
    worker!.onmessage = (ev) => {
      if (ev.data.type === 'ready') res()
      else if (ev.data.type === 'result') { pending.get(ev.data.id)?.(ev.data); pending.delete(ev.data.id) }
    }
    worker!.postMessage({ type: 'load', url: `${import.meta.env.BASE_URL}data/graph.json` })
  })
  return ready
}

export async function computeRoute(from: [number, number], to: [number, number], profile: Profile): Promise<RouteOut> {
  await ensure()
  const id = ++seq
  return new Promise((res) => {
    pending.set(id, res)
    worker!.postMessage({ type: 'route', id, from, to, profile })
  })
}

export function useRoute() {
  const [res, setRes] = useState<RouteOut | null>(null)
  const [busy, setBusy] = useState(false)
  const token = useRef(0)
  const run = useCallback(async (from: [number, number], to: [number, number], profile: Profile) => {
    const t = ++token.current
    setBusy(true)
    const r = await computeRoute(from, to, profile)
    if (t === token.current) { setRes(r); setBusy(false) }
    return r
  }, [])
  useEffect(() => () => { token.current++ }, [])
  return { res, busy, run, clear: () => setRes(null) }
}
