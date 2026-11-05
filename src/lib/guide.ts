import { bearing, haversine } from './geo'

/** Indicaciones paso a paso (como un navegador de coche), sacadas de la geometría de la ruta. */
export type Kind = 'start' | 'slight-left' | 'left' | 'sharp-left' | 'slight-right' | 'right' | 'sharp-right' | 'uturn' | 'roundabout' | 'arrive'
export interface Step { at: number; kind: Kind; text: string; road?: string }
type Pt = ArrayLike<number | undefined> // [lng, lat, ele?]

export const TURN_TEXT: Record<Kind, string> = {
  start: 'Empieza',
  'slight-left': 'Gira ligeramente a la izquierda',
  left: 'Gira a la izquierda',
  'sharp-left': 'Gira cerrado a la izquierda',
  'slight-right': 'Gira ligeramente a la derecha',
  right: 'Gira a la derecha',
  'sharp-right': 'Gira cerrado a la derecha',
  uturn: 'Date la vuelta',
  roundabout: 'En la rotonda',
  arrive: 'Has llegado',
}

const DIR8 = ['norte', 'noreste', 'este', 'sureste', 'sur', 'suroeste', 'oeste', 'noroeste']
export const dirName = (deg: number) => DIR8[Math.round((((deg % 360) + 360) % 360) / 45) % 8]

/** Giro con signo en grados: positivo = a la derecha. */
const signed = (from: number, to: number) => ((((to - from) % 360) + 540) % 360) - 180

export function kindFor(delta: number): Kind | null {
  const a = Math.abs(delta)
  const r = delta > 0
  if (a < 35) return null
  if (a < 65) return r ? 'slight-right' : 'slight-left'
  if (a < 125) return r ? 'right' : 'left'
  if (a < 165) return r ? 'sharp-right' : 'sharp-left'
  return 'uturn'
}

export function cumulative(coords: Pt[]): number[] {
  const c = [0]
  for (let i = 1; i < coords.length; i++) c.push(c[i - 1] + haversine(coords[i - 1][1] as number, coords[i - 1][0] as number, coords[i][1] as number, coords[i][0] as number))
  return c
}

/** Punto de la ruta a `d` metros del inicio. */
export function pointAt(coords: Pt[], cum: number[], d: number): [number, number] {
  if (d <= 0) return [coords[0][0] as number, coords[0][1] as number]
  const total = cum[cum.length - 1]
  if (d >= total) { const l = coords[coords.length - 1]; return [l[0] as number, l[1] as number] }
  let i = 1
  while (cum[i] < d) i++
  const t = (d - cum[i - 1]) / Math.max(cum[i] - cum[i - 1], 0.01)
  return [(coords[i - 1][0] as number) + t * ((coords[i][0] as number) - (coords[i - 1][0] as number)), (coords[i - 1][1] as number) + t * ((coords[i][1] as number) - (coords[i - 1][1] as number))]
}

/** Giros de un recorrido a pie: compara el rumbo de los 25 m anteriores con el de los 25 m siguientes. */
export function buildSteps(coords: Pt[], opts: { window?: number; min?: number } = {}): Step[] {
  if (coords.length < 2) return []
  const W = opts.window ?? 25
  const cum = cumulative(coords)
  const total = cum[cum.length - 1]
  const at = (d: number) => pointAt(coords, cum, Math.max(0, Math.min(total, d)))
  const cands: Array<{ at: number; delta: number }> = []
  for (let i = 1; i < coords.length - 1; i++) {
    const d = cum[i]
    if (d < 8 || total - d < 8) continue
    const w = Math.min(W, d - 1, total - d - 1)
    if (w < 6) continue
    const a = at(d - w), b = [coords[i][0] as number, coords[i][1] as number], c = at(d + w)
    const delta = signed(bearing(a[1], a[0], b[1], b[0]), bearing(b[1], b[0], c[1], c[0]))
    if (Math.abs(delta) >= (opts.min ?? 35)) cands.push({ at: d, delta })
  }
  // De cada racha de puntos cercanos me quedo con el giro más marcado.
  const kept: Array<{ at: number; delta: number }> = []
  for (const c of cands) {
    const last = kept[kept.length - 1]
    if (last && c.at - last.at < 35) { if (Math.abs(c.delta) > Math.abs(last.delta)) kept[kept.length - 1] = c } else kept.push(c)
  }
  const first = at(30)
  const s0 = coords[0]
  const steps: Step[] = [{ at: 0, kind: 'start', text: `Sal hacia el ${dirName(bearing(s0[1] as number, s0[0] as number, first[1], first[0]))}` }]
  for (const k of kept) {
    const kind = kindFor(k.delta)
    if (kind) steps.push({ at: k.at, kind, text: TURN_TEXT[kind] })
  }
  steps.push({ at: total, kind: 'arrive', text: 'Has llegado' })
  return steps
}

/** Posición sobre la ruta: busca cerca de lo ya recorrido para no saltar en rutas que se cruzan; si no hay nada cerca, busca en toda. */
export function locate(coords: Pt[], cum: number[], lat: number, lng: number, hint = 0): { d: number; along: number } {
  const k = Math.cos((lat * Math.PI) / 180) * 111320
  const scan = (lo: number, hi: number) => {
    let best = { d: Infinity, along: 0 }
    for (let i = 1; i < coords.length; i++) {
      if (cum[i] < lo || cum[i - 1] > hi) continue
      const ax = ((coords[i - 1][0] as number) - lng) * k, ay = ((coords[i - 1][1] as number) - lat) * 111320
      const bx = ((coords[i][0] as number) - lng) * k, by = ((coords[i][1] as number) - lat) * 111320
      const dx = bx - ax, dy = by - ay
      const l2 = dx * dx + dy * dy
      const t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0
      const d = Math.hypot(ax + t * dx, ay + t * dy)
      if (d < best.d) best = { d, along: cum[i - 1] + t * (cum[i] - cum[i - 1]) }
    }
    return best
  }
  const near = scan(hint - 80, hint + 500)
  return near.d <= 60 ? near : scan(-1, Infinity)
}

/** Siguiente indicación por delante de `along`. */
export function nextStep(steps: Step[], along: number): { step: Step; idx: number; toNext: number; after: Step | null } | null {
  for (let i = 1; i < steps.length; i++) {
    if (steps[i].at > along + 2) return { step: steps[i], idx: i, toNext: steps[i].at - along, after: steps[i + 1] ?? null }
  }
  return null
}

export function remaining(coords: Pt[], cum: number[], along: number): { dist: number; asc: number; desc: number } {
  const total = cum[cum.length - 1]
  let asc = 0, desc = 0
  for (let i = 1; i < coords.length; i++) {
    if (cum[i] <= along) continue
    const dz = ((coords[i][2] as number) ?? 0) - ((coords[i - 1][2] as number) ?? 0)
    if (dz > 0) asc += dz; else desc -= dz
  }
  return { dist: Math.max(0, total - along), asc, desc }
}

export const fmtM = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km` : `${Math.max(0, Math.round(m / 10) * 10)} m`)

/** Frase para la voz. */
export function spoken(step: Step, dist: number): string {
  const say = step.kind === 'arrive' ? 'Llegarás a tu destino' : step.text.charAt(0).toLowerCase() + step.text.slice(1)
  const road = step.road ? ` por ${step.road}` : ''
  if (dist < 25) return step.kind === 'arrive' ? 'Has llegado' : `${step.text}${road} ahora`
  const n = dist >= 1000 ? `${(dist / 1000).toFixed(1).replace('.', ',')} kilómetros` : `${Math.round(dist / 10) * 10} metros`
  return `En ${n}, ${say}${road}`
}
