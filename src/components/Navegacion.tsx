import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp, ArrowUpLeft, ArrowUpRight, BatteryLow, CircleDot, CornerUpLeft, CornerUpRight, Flag, LocateFixed, Navigation, Undo2, Volume2, VolumeX, X } from 'lucide-react'
import { db } from '../lib/db'
import { driveRoute } from '../lib/drive'
import { bearing, haversine } from '../lib/geo'
import { buildSteps, cumulative, dirName, fmtM, locate, nextStep, pointAt, remaining, spoken, type Kind, type Step } from '../lib/guide'
import { computeRoute, walkTimeMin } from '../lib/router'
import { isMuted, setMuted, speak, voiceAvailable } from '../lib/voice'
import type { Place } from '../lib/types'

const MapView = lazy(() => import('./MapView'))

export interface Leg {
  mode: 'pie' | 'coche'
  /** Dónde acaba este tramo (nombre y punto lat, lng). */
  label: string
  to: [number, number]
  coords: [number, number, number][]
  steps: Step[]
  /** Duración en segundos (coche). */
  dur?: number
  /** Sin conexión: solo línea recta. */
  approx?: boolean
}

interface Fix { lat: number; lng: number; acc: number; speed: number | null; heading: number | null }

const ICON: Record<Kind, typeof ArrowUp> = {
  start: Navigation, 'slight-left': ArrowUpLeft, left: CornerUpLeft, 'sharp-left': CornerUpLeft, 'slight-right': ArrowUpRight, right: CornerUpRight, 'sharp-right': CornerUpRight, uturn: Undo2, roundabout: CircleDot, arrive: Flag,
}
const hhmm = (ms: number) => new Date(ms).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })

/** Cuántos metros antes se avisa de cada giro. */
const ALERTS: Record<Leg['mode'], number[]> = { pie: [150, 40, 12], coche: [900, 250, 60] }
const OFF: Record<Leg['mode'], number> = { pie: 45, coche: 70 }
const ARRIVE: Record<Leg['mode'], number> = { pie: 20, coche: 40 }

export function buildWalkLeg(coords: [number, number, number][], label: string, to: [number, number]): Leg {
  return { mode: 'pie', label, to, coords, steps: buildSteps(coords) }
}

interface Props { legs: Leg[]; dest: Place; places: Place[]; simulate?: boolean; onClose: () => void }

/** Navegación giro a giro a pantalla completa: banner de la próxima maniobra, voz, recálculo y llegada. */
export default function Navegacion({ legs: initial, dest, places, simulate = false, onClose }: Props) {
  const [legs, setLegs] = useState(initial)
  const [li, setLi] = useState(0)
  const [fix, setFix] = useState<Fix | null>(null)
  const [hdg, setHdg] = useState<number | null>(null)
  const [compassDeg, setCompassDeg] = useState<number | null>(null)
  const [along, setAlong] = useState(0)
  const [follow, setFollow] = useState(true)
  const [muted, setMut] = useState(isMuted())
  const [saver, setSaver] = useState(false)
  const [rec, setRec] = useState(false)
  const [notice, setNotice] = useState('')
  const [lost, setLost] = useState(false)
  const [done, setDone] = useState(false)
  const [now, setNow] = useState(Date.now())
  const leg = legs[li]
  const cum = useMemo(() => cumulative(leg.coords), [leg])
  const alongRef = useRef(0)
  const offCount = useRef(0)
  const lastReroute = useRef(0)
  const said = useRef(new Set<string>())
  const recPts = useRef<[number, number, number?][]>([])
  const legRef = useRef(leg)
  legRef.current = leg
  const liRef = useRef(li)
  liRef.current = li

  // GPS real, o recorrido simulado (vista previa en casa: se mueve solo a lo largo de la ruta).
  useEffect(() => {
    if (simulate) {
      let d = 0
      const t = setInterval(() => {
        const l = legRef.current
        const c = cumulative(l.coords)
        d += l.mode === 'pie' ? 9 : 35
        if (d >= c[c.length - 1] + 5) { d = 0; return }
        const p = pointAt(l.coords, c, d), q = pointAt(l.coords, c, d + 6)
        setFix({ lat: p[1], lng: p[0], acc: 5, speed: 3, heading: bearing(p[1], p[0], q[1], q[0]) })
      }, 700)
      return () => clearInterval(t)
    }
    if (!navigator.geolocation) { setNotice('Este móvil no tiene GPS en el navegador.'); return }
    const id = navigator.geolocation.watchPosition(
      (p) => { setNotice(''); setFix({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, speed: p.coords.speed, heading: p.coords.heading }) },
      (e) => setNotice(e.code === 1 ? 'Permite la ubicación para navegar.' : 'No encuentro señal GPS. Sal a cielo abierto.'),
      { enableHighAccuracy: !saver, maximumAge: saver ? 15000 : 1000, timeout: 30000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [simulate, saver])

  // Brújula cuando estás parado (el GPS solo da rumbo en movimiento).
  useEffect(() => {
    const h = (e: DeviceOrientationEvent & { webkitCompassHeading?: number }) => {
      const v = e.webkitCompassHeading ?? (e.alpha != null ? (360 - e.alpha) % 360 : null)
      if (v != null) setCompassDeg(v)
    }
    window.addEventListener('deviceorientationabsolute', h as EventListener, true)
    window.addEventListener('deviceorientation', h as EventListener, true)
    return () => { window.removeEventListener('deviceorientationabsolute', h as EventListener, true); window.removeEventListener('deviceorientation', h as EventListener, true) }
  }, [])

  // Pantalla encendida
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock
    wl?.request('screen').then((l) => (lock = l)).catch(() => {})
    return () => { void lock?.release() }
  }, [])
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 20000); return () => clearInterval(i) }, [])

  // Rumbo suavizado: el del GPS si te mueves, la brújula si estás parado.
  useEffect(() => {
    if (!fix) return
    const raw = fix.speed && fix.speed > 1 && fix.heading != null ? fix.heading : (compassDeg ?? fix.heading)
    if (raw == null || Number.isNaN(raw)) return
    setHdg((h) => (h == null ? raw : (h + (((raw - h + 540) % 360) - 180) * 0.45 + 360) % 360))
  }, [fix, compassDeg])

  const reroute = useCallback(async (f: Fix) => {
    if (Date.now() - lastReroute.current < 12000) return
    lastReroute.current = Date.now()
    const l = legRef.current
    setNotice('Recalculando…')
    let nl: Leg | null = null
    if (l.mode === 'pie') {
      const r = await computeRoute([f.lat, f.lng], l.to, 'directo')
      if (r.ok) nl = { ...l, coords: r.coords, steps: buildSteps(r.coords) }
    } else {
      const r = await driveRoute([f.lat, f.lng], l.to)
      if (r) nl = { ...l, coords: r.coords, steps: r.steps, dur: r.dur, approx: false }
    }
    if (nl) {
      setLegs((all) => all.map((x, i) => (i === liRef.current ? nl! : x)))
      alongRef.current = 0; setAlong(0); said.current = new Set(); setLost(false); setNotice('')
      speak('Ruta recalculada')
    } else { setLost(true); setNotice('') }
  }, [])

  // Cada posición nueva: avance, desvío, avisos de voz y llegada.
  useEffect(() => {
    if (!fix) return
    if (rec && fix.acc < 60) {
      const last = recPts.current[recPts.current.length - 1]
      if (!last || haversine(last[1], last[0], fix.lat, fix.lng) > 4) recPts.current.push([fix.lng, fix.lat])
    }
    const loc = locate(leg.coords, cum, fix.lat, fix.lng, alongRef.current)
    if (loc.d > OFF[leg.mode] && fix.acc < 80) {
      offCount.current++
      if (offCount.current >= 2) { setLost(true); void reroute(fix) }
      return
    }
    offCount.current = 0; setLost(false)
    alongRef.current = loc.along; setAlong(loc.along)
    const total = cum[cum.length - 1]
    if (total - loc.along <= ARRIVE[leg.mode]) {
      if (li < legs.length - 1) {
        speak(`Has llegado a ${leg.label}. Ahora, a pie hacia ${dest.name}`)
        alongRef.current = 0; setAlong(0); said.current = new Set(); setLi(li + 1)
      } else if (!done) { setDone(true); speak(`Has llegado a ${dest.name}`) }
      return
    }
    const nx = nextStep(leg.steps, loc.along)
    if (nx) {
      for (const th of ALERTS[leg.mode]) {
        const key = `${li}-${nx.idx}-${th}`
        if (nx.toNext <= th && !said.current.has(key)) {
          // Marca también los avisos más lejanos para no decirlos a destiempo.
          for (const t2 of ALERTS[leg.mode]) if (t2 >= th) said.current.add(`${li}-${nx.idx}-${t2}`)
          speak(spoken(nx.step, nx.toNext))
          break
        }
      }
    }
  }, [fix]) // eslint-disable-line react-hooks/exhaustive-deps

  // Primera frase al empezar.
  useEffect(() => { speak(`${leg.steps[0]?.text ?? 'Empieza'}. ${leg.mode === 'coche' ? 'Voy contigo hasta el aparcamiento.' : ''}`) }, [li]) // eslint-disable-line react-hooks/exhaustive-deps

  const nx = nextStep(leg.steps, along)
  const left = remaining(leg.coords, cum, along)
  const legMin = (l: Leg, rem: { dist: number; asc: number; desc: number }, totalLen: number) =>
    l.mode === 'coche' ? ((l.dur ?? 0) / 60) * (totalLen ? rem.dist / totalLen : 1) : walkTimeMin(rem.dist, rem.asc, rem.desc)
  const minLeft = legMin(leg, left, cum[cum.length - 1]) + legs.slice(li + 1).reduce((s, l) => { const c = cumulative(l.coords); return s + legMin(l, remaining(l.coords, c, 0), c[c.length - 1]) }, 0)
  const distLeft = left.dist + legs.slice(li + 1).reduce((s, l) => s + cumulative(l.coords).slice(-1)[0], 0)
  const me = fix ? { lng: fix.lng, lat: fix.lat, heading: hdg } : null
  const Icon = nx ? ICON[nx.step.kind] : Flag
  const straight = fix ? { dir: dirName(bearing(fix.lat, fix.lng, leg.to[0], leg.to[1])), d: haversine(fix.lat, fix.lng, leg.to[0], leg.to[1]) } : null

  const toggleMute = () => { setMuted(!muted); setMut(!muted) }
  const finish = async () => {
    if (rec && recPts.current.length > 5) await db.tracks.add({ id: crypto.randomUUID(), name: `Hacia ${dest.name}`, coords: recPts.current, at: Date.now(), source: 'rec' })
    if (voiceAvailable()) window.speechSynthesis.cancel()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[90] flex flex-col" style={{ background: 'var(--bg)' }} role="dialog" aria-label="Navegación">
      <div className="relative min-h-0 flex-1">
        <Suspense fallback={<div className="grid h-full place-items-center">Cargando mapa…</div>}>
          <MapView places={places.filter((p) => p.id === dest.id)} onSelect={() => {}} is3D={false} layer={leg.mode === 'coche' ? 'ign' : 'mtn'} trails={leg.mode === 'pie'} me={me} follow={follow} navZoom={leg.mode === 'coche' ? 15.4 : 17} fitRoute={false} route={leg.coords} controls={false} onDrag={() => setFollow(false)} initialCenter={fix ? [fix.lng, fix.lat] : [leg.coords[0][0], leg.coords[0][1]]} initialZoom={15} />
        </Suspense>

        {/* Próxima maniobra */}
        <div className="absolute inset-x-3 rounded-3xl p-3 shadow-2xl" style={{ top: 'calc(var(--safe-t) + 10px)', background: '#13243b', color: '#fff' }} aria-live="polite">
          {done ? (
            <div className="flex items-center gap-3"><Flag size={44} /><div><p className="font-display text-2xl font-bold">¡Has llegado!</p><p className="text-sm opacity-80">{dest.name}</p></div></div>
          ) : lost && straight ? (
            <div className="flex items-center gap-3">
              <ArrowUp size={44} style={{ transform: `rotate(${Math.round(bearing(fix!.lat, fix!.lng, leg.to[0], leg.to[1]) - (hdg ?? 0))}deg)` }} />
              <div><p className="font-display text-xl font-bold leading-tight">{notice || 'Fuera de la ruta'}</p><p className="text-sm opacity-80">{leg.mode === 'pie' ? `No hay camino cerca. ${dest.name} está a ${fmtM(straight.d)} al ${straight.dir}.` : `Busco otra ruta. Destino a ${fmtM(straight.d)} al ${straight.dir}.`}</p></div>
            </div>
          ) : nx ? (
            <>
              <div className="flex items-center gap-3">
                <Icon size={52} strokeWidth={2.6} className={nx.step.kind === 'sharp-left' || nx.step.kind === 'sharp-right' ? 'scale-110' : ''} style={nx.step.kind === 'sharp-right' || nx.step.kind === 'sharp-left' ? { transform: 'rotate(' + (nx.step.kind === 'sharp-right' ? 50 : -50) + 'deg)' } : undefined} />
                <div className="min-w-0">
                  <p className="font-display text-4xl font-bold leading-none">{fmtM(nx.toNext)}</p>
                  <p className="mt-1 text-lg font-semibold leading-tight">{nx.step.text}{nx.step.road ? ` · ${nx.step.road}` : ''}</p>
                </div>
              </div>
              {nx.after && nx.after.kind !== 'arrive' && <p className="mt-2 rounded-xl px-3 py-1 text-sm" style={{ background: '#ffffff1f' }}>Después: {nx.after.text.charAt(0).toLowerCase() + nx.after.text.slice(1)} en {fmtM(nx.after.at - nx.step.at)}</p>}
            </>
          ) : (
            <div className="flex items-center gap-3"><Flag size={44} /><div><p className="font-display text-2xl font-bold">{fmtM(left.dist)}</p><p className="text-sm opacity-80">hasta {leg.label}</p></div></div>
          )}
          {leg.approx && <p className="mt-2 rounded-xl px-3 py-1 text-xs font-semibold" style={{ background: '#e5b23a', color: '#13243b' }}>Sin conexión: solo te marco la dirección en línea recta hasta el aparcamiento.</p>}
          {!fix && !simulate && <p className="mt-2 text-sm">{notice || 'Buscando GPS…'}</p>}
          {fix && notice && !lost && <p className="mt-2 text-sm font-semibold">{notice}</p>}
        </div>

        <div className="absolute right-3 flex flex-col gap-2" style={{ bottom: 58 }}>
          <button onClick={toggleMute} aria-pressed={muted} aria-label={muted ? 'Activar la voz' : 'Silenciar la voz'} className="tap grid h-12 w-12 place-items-center rounded-full shadow-lg" style={{ background: 'var(--surface)' }}>{muted ? <VolumeX size={22} /> : <Volume2 size={22} />}</button>
          <button onClick={() => setSaver(!saver)} aria-pressed={saver} aria-label="Ahorro de batería" className="tap grid h-12 w-12 place-items-center rounded-full shadow-lg" style={{ background: saver ? 'var(--accent)' : 'var(--surface)', color: saver ? '#fff' : 'var(--ink)' }}><BatteryLow size={22} /></button>
          <button onClick={() => setRec(!rec)} aria-pressed={rec} aria-label="Grabar recorrido" className="tap grid h-12 w-12 place-items-center rounded-full shadow-lg" style={{ background: rec ? '#d1553f' : 'var(--surface)', color: rec ? '#fff' : 'var(--ink)' }}><CircleDot size={22} /></button>
        </div>
        {!follow && <button onClick={() => setFollow(true)} className="tap absolute left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full px-5 font-bold text-white shadow-xl" style={{ bottom: 14, background: 'var(--accent)' }}><LocateFixed size={20} />Recentrar</button>}
      </div>

      {/* Llegada y datos */}
      <div className="flex items-center gap-3 px-4 pt-3" style={{ paddingBottom: 'calc(var(--safe-b) + 12px)', background: 'var(--bg)' }}>
        <div className="grid flex-1 grid-cols-3 text-center">
          <div><p className="font-display text-2xl font-bold leading-tight">{hhmm(now + minLeft * 60000)}</p><p className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>llegada</p></div>
          <div><p className="font-display text-2xl font-bold leading-tight">{Math.round(minLeft) >= 60 ? `${Math.floor(minLeft / 60)} h ${String(Math.round(minLeft % 60)).padStart(2, '0')}` : `${Math.max(1, Math.round(minLeft))} min`}</p><p className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>{leg.mode === 'coche' ? 'en coche' : 'a pie'}</p></div>
          <div><p className="font-display text-2xl font-bold leading-tight">{fmtM(distLeft)}</p><p className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>quedan</p></div>
        </div>
        <button onClick={finish} className="tap flex shrink-0 items-center gap-2 rounded-2xl px-5 py-3 text-base font-bold text-white" style={{ background: '#d1553f' }}><X size={20} />{done ? 'Terminar' : 'Salir'}</button>
      </div>
      {legs.length > 1 && <p className="px-4 pb-2 text-center text-xs" style={{ color: 'var(--ink-soft)', paddingBottom: 'calc(var(--safe-b) + 2px)' }}>Tramo {li + 1} de {legs.length}: {leg.mode === 'coche' ? 'en coche' : 'a pie'} hasta {leg.label}</p>}
    </div>
  )
}
