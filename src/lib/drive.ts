import { cumulative, type Kind, type Step } from './guide'

/** Ruta en coche con OSRM (servidor público gratuito). Necesita cobertura: sin ella devuelve null. */
export interface DriveRoute { coords: [number, number, number][]; steps: Step[]; dist: number; dur: number }

interface OsrmStep { distance: number; name?: string; maneuver: { type: string; modifier?: string; exit?: number } }

const MOD: Record<string, Kind> = {
  left: 'left', right: 'right', 'slight left': 'slight-left', 'slight right': 'slight-right', 'sharp left': 'sharp-left', 'sharp right': 'sharp-right', uturn: 'uturn',
}
const TEXT: Record<Kind, string> = {
  start: 'Empieza', arrive: 'Has llegado', roundabout: 'En la rotonda', uturn: 'Date la vuelta',
  left: 'Gira a la izquierda', right: 'Gira a la derecha', 'slight-left': 'Gira ligeramente a la izquierda', 'slight-right': 'Gira ligeramente a la derecha',
  'sharp-left': 'Gira cerrado a la izquierda', 'sharp-right': 'Gira cerrado a la derecha',
}
const ORD = ['', 'primera', 'segunda', 'tercera', 'cuarta', 'quinta', 'sexta']

export function mapOsrmSteps(raw: OsrmStep[]): Step[] {
  const out: Step[] = []
  let at = 0
  for (const s of raw) {
    const { type, modifier, exit } = s.maneuver
    const road = s.name && s.name.trim() ? s.name.trim() : undefined
    if (type === 'depart') out.push({ at, kind: 'start', text: road ? `Empieza por ${road}` : 'Empieza a conducir' })
    else if (type === 'arrive') out.push({ at, kind: 'arrive', text: 'Has llegado' })
    else if (type === 'roundabout' || type === 'rotary') out.push({ at, kind: 'roundabout', text: `En la rotonda, toma la ${ORD[exit ?? 1] ?? `${exit}ª`} salida`, road })
    else if (type === 'exit roundabout') { /* ya dicho al entrar */ }
    else {
      const kind = modifier ? MOD[modifier] : undefined
      if (kind) {
        const pre = type === 'fork' ? (kind.includes('left') ? 'En la bifurcación, mantente a la izquierda' : 'En la bifurcación, mantente a la derecha') : type === 'off ramp' ? 'Toma la salida' : TEXT[kind]
        out.push({ at, kind, text: pre, road })
      }
    }
    at += s.distance
  }
  return out
}

export async function driveRoute(from: [number, number], to: [number, number]): Promise<DriveRoute | null> {
  if (!navigator.onLine) return null
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), 9000)
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson&steps=true`
    const r = await fetch(url, { signal: ctl.signal })
    if (!r.ok) return null
    const j = await r.json()
    const rt = j.routes?.[0]
    if (!rt) return null
    const coords = (rt.geometry.coordinates as number[][]).map((c) => [c[0], c[1], 0] as [number, number, number])
    const steps = mapOsrmSteps(rt.legs.flatMap((l: { steps: OsrmStep[] }) => l.steps))
    return { coords, steps, dist: rt.distance, dur: rt.duration }
  } catch { return null } finally { clearTimeout(t) }
}

/** Sin red: una sola indicación en línea recta. */
export function straightRoute(from: [number, number], to: [number, number], dirText: string): DriveRoute {
  const coords: [number, number, number][] = [[from[1], from[0], 0], [to[1], to[0], 0]]
  const dist = cumulative(coords)[1]
  return { coords, steps: [{ at: 0, kind: 'start', text: dirText }, { at: dist, kind: 'arrive', text: 'Has llegado' }], dist, dur: (dist / 1000 / 50) * 3600 }
}
