import { hhmm } from './access'
import * as SunCalc from 'suncalc'
import { compass, haversine } from './geo'
import { evaluate, evaluateLight, type Ctx, type Entry } from './plan'
import { walkTimeMin } from './router'
import { SLEEP_KINDS, type Place } from './types'

export interface Pick { dayIdx: number; entry: Entry }
export interface Finde { primary: Pick; alts: Pick[]; nights: number[] }

/** Noches de viernes y sábado más próximas (las del finde). Si no hay, hoy y mañana. */
export function weekendNights(days: Date[]): number[] {
  const idx = days.map((d, i) => ({ d, i })).filter(({ d }) => d.getDay() === 5 || d.getDay() === 6).map(({ i }) => i)
  return idx.length ? idx.slice(0, 2) : [0, 1].filter((i) => i < days.length)
}

const ok = (p: Place, winter: boolean) => {
  if (!(SLEEP_KINDS.includes(p.kind) || p.kind === 'candidato') || p.kind === 'vivac' || p.kind === 'deseo') return false
  if (p.kind === 'abrigo' && p.toponym) return false
  if ((p.ele ?? 9999) < 1200) return false
  if (winter && (p.kind === 'parapeto' || p.kind === 'candidato' || p.shelter === 'raso')) return false
  return true
}

/**
 * Elige el mejor sitio y noche del finde según el tipo de noche (en ctx.prefs), los «me gusta» (ya suman en la nota)
 * y lo que aún no se ha visitado. Devuelve además 2 planes B cercanos.
 */
export function pickPlan(places: Place[], days: Date[], ctx: Ctx, opts: { winter: boolean; nights?: number[] }): Finde | null {
  const nights = opts.nights ?? weekendNights(days)
  const cands = places.filter((p) => ok(p, opts.winter))
  const scored: Array<{ dayIdx: number; e: Entry; s: number }> = []
  for (const dayIdx of nights) {
    for (const p of cands) {
      const e = evaluateLight(p, days[dayIdx], ctx)
      if (e) scored.push({ dayIdx, e, s: e.score.score + (p.visited ? 0 : 6) })
    }
  }
  if (!scored.length) return null
  scored.sort((a, b) => b.s - a.s)
  const best = scored[0]
  const full = (x: { dayIdx: number; e: Entry }): Pick => ({ dayIdx: x.dayIdx, entry: evaluate(x.e.place, days[x.dayIdx], ctx) ?? x.e })
  // Planes B: cerca del principal (≤ 20 km), otro sitio, nota razonable
  const seen = new Set([best.e.place.id])
  const alts: Pick[] = []
  for (const x of scored) {
    if (alts.length >= 2) break
    if (seen.has(x.e.place.id)) continue
    if (haversine(best.e.place.lat, best.e.place.lng, x.e.place.lat, x.e.place.lng) > 20000) continue
    if (x.s < best.s - 30) continue
    seen.add(x.e.place.id)
    alts.push(full(x))
  }
  return { primary: full(best), alts, nights }
}

export interface Step { at: Date; icon: string; title: string; detail?: string }

/** Horario completo: casa → aparcamiento → llegada con luz → hora más fría → amanecer → vuelta. */
export function timeline(e: Entry, ctx: Ctx, key?: { quien?: string; tel?: string; horario?: string } | null): Step[] {
  const a = e.access[0]
  const steps: Step[] = []
  if (!a || !e.leave) {
    steps.push({ at: e.night.sunset, icon: '🌇', title: 'Puesta de sol', detail: 'No hay aparcamiento conocido para calcular el viaje.' })
    return steps
  }
  const leave = e.leave
  if (key !== undefined) steps.push({ at: new Date(leave.getTime() - 45 * 60000), icon: '🔑', title: 'Recoger la llave', detail: [key?.quien, key?.tel, key?.horario].filter(Boolean).join(' · ') || 'Sin datos de a quién pedirla: averígualo antes.' })
  steps.push({ at: leave, icon: '🚗', title: `Salir de ${ctx.prefs.homeName}`, detail: `${a.driveMin} min en coche (${a.driveKm.toFixed(0)} km)` })
  const parkAt = new Date(leave.getTime() + a.driveMin * 60000)
  steps.push({ at: parkAt, icon: '🅿️', title: `Aparcar en ${a.parking.name}`, detail: `${Math.round(a.walkKm * 10) / 10} km andando, ${Math.round(a.walkMin)} min` })
  const arrive = new Date(parkAt.getTime() + a.walkMin * 60000)
  steps.push({ at: arrive, icon: '⛺', title: `Llegar a ${e.place.name}`, detail: arrive.getTime() <= e.night.sunset.getTime() ? `Con luz: la puesta de sol es a las ${hhmm(e.night.sunset)}. Margen para montar y cenar.` : '⚠️ Llegas de noche: lleva frontal y baterías.' })
  steps.push({ at: e.night.sunset, icon: '🌇', title: 'Puesta de sol' })
  const cold = e.stats.series.reduce((m, x) => (x.temp < m.temp ? x : m), e.stats.series[0])
  if (cold) steps.push({ at: new Date(cold.t), icon: '🥶', title: 'Hora más fría', detail: `${Math.round(cold.temp).toString().replace('-', '−')} °C: ponte la última capa antes.` })
  const az = (SunCalc.getPosition(e.night.sunrise, e.place.lat, e.place.lng).azimuth * 180) / Math.PI + 180
  steps.push({ at: e.night.sunrise, icon: '🌅', title: 'Amanecer', detail: `El sol sale por el ${compass(az)}.` })
  const dz = (e.place.ele ?? 0) - (a.parking.ele ?? 0)
  const back = walkTimeMin(a.walkKm * 1000, Math.max(0, -dz), Math.max(0, dz))
  const depart = new Date(e.night.sunrise.getTime() + 75 * 60000)
  steps.push({ at: depart, icon: '☕', title: 'Desayunar y recoger', detail: 'Deja el sitio mejor de como lo encontraste.' })
  const car = new Date(depart.getTime() + back * 60000)
  steps.push({ at: car, icon: '🅿️', title: 'De vuelta al coche', detail: `${Math.round(back)} min andando` })
  steps.push({ at: new Date(car.getTime() + a.driveMin * 60000), icon: '🏠', title: `Llegar a ${ctx.prefs.homeName}` })
  return steps.sort((x, y) => x.at.getTime() - y.at.getTime())
}

const esc = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n')
const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

/** Archivo .ics (calendario) con el plan y un aviso el día antes. */
export function makeIcs(o: { title: string; start: Date; end: Date; description: string; lat: number; lng: number; location: string }): string {
  const now = fmt(new Date())
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Vivac//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:${crypto.randomUUID()}@vivac`, `DTSTAMP:${now}`, `DTSTART:${fmt(o.start)}`, `DTEND:${fmt(o.end)}`,
    `SUMMARY:${esc(o.title)}`, `LOCATION:${esc(o.location)}`, `GEO:${o.lat};${o.lng}`, `DESCRIPTION:${esc(o.description)}`,
    'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', 'DESCRIPTION:Mañana sales de vivac: revisa la previsión y la mochila', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n')
}

export const SAFETY = [
  'Avisa a alguien de dónde vas y a qué hora esperas volver; si no das señales, que llame al 112.',
  'Mira el parte oficial (AEMET) la víspera: la previsión de una app es orientativa.',
  'Frontal con pilas nuevas, batería externa y la ruta descargada: puede que no haya cobertura.',
  'Si hay nieve o hielo, lleva crampones o raquetas y cadenas para el coche.',
  'Un cambio de tiempo manda: si empeora, baja. Hay plan B en esta misma pantalla.',
]
