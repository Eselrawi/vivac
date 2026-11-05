import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BatteryLow, Car, Circle, Copy, Crosshair, FileUp, Flag, LocateFixed, MapPinned, Mountain, Navigation2, Sun, X } from 'lucide-react'
import { db, useLive, type TrackRecord } from '../lib/db'
import { toDMS, toUTM } from '../lib/coords'
import { compass, fmtDur, haversine, bearing, projectOnLine } from '../lib/geo'
import { parseGpx } from '../lib/gpx'
import { computeRoute } from '../lib/router'
import { detectPlatform } from '../lib/platform'
import { KIND_LABEL, SLEEP_KINDS, type Place } from '../lib/types'

const MapView = lazy(() => import('./MapView'))

interface Fix { lat: number; lng: number; alt: number | null; acc: number; speed: number | null; heading: number | null; t: number }
type Pt = [number, number, number?]
const km = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`)

/** Pantalla completa «Mi GPS»: flecha de rumbo, datos, grabación del recorrido, volver al coche y avisos de salida del camino. */
export default function MiGps({ places, onClose }: { places: Place[]; onClose: () => void }) {
  const [fix, setFix] = useState<Fix | null>(null)
  const [compassDeg, setCompassDeg] = useState<number | null>(null)
  const [follow, setFollow] = useState(true)
  const [saver, setSaver] = useState(false)
  const [awake, setAwake] = useState(true)
  const [rec, setRec] = useState(false)
  const [dist, setDist] = useState(0)
  const [asc, setAsc] = useState(0)
  const [t0, setT0] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())
  const [msg, setMsg] = useState('')
  const [follow2, setFollow2] = useState<Pt[] | null>(null) // GPX importado que se sigue
  const [back, setBack] = useState<[number, number, number][] | null>(null)
  const [layer, setLayer] = useState<'vec' | 'mtn' | 'pnoa'>('mtn')
  const pts = useRef<Pt[]>([])
  const lastAlt = useRef<number | null>(null)
  const car = useLive(async () => (await db.kv.get('car'))?.v as { lat: number; lng: number } | undefined, undefined)
  const tracks = useLive<TrackRecord[]>(() => db.tracks.toArray(), [])
  const ios = detectPlatform() === 'ios'

  // GPS
  useEffect(() => {
    if (!navigator.geolocation) { setMsg('Este móvil no tiene GPS en el navegador.'); return }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const f: Fix = { lat: p.coords.latitude, lng: p.coords.longitude, alt: p.coords.altitude, acc: p.coords.accuracy, speed: p.coords.speed, heading: p.coords.heading, t: p.timestamp }
        setFix(f); setMsg('')
        if (!rec) return
        const last = pts.current[pts.current.length - 1]
        const d = last ? haversine(last[1], last[0], f.lat, f.lng) : 0
        if (last && d < 4) return // ignora el ruido quieto
        pts.current.push([f.lng, f.lat, f.alt ?? undefined])
        setDist((x) => x + d)
        if (f.alt != null) {
          if (lastAlt.current != null && f.alt - lastAlt.current >= 3) { setAsc((x) => x + (f.alt! - lastAlt.current!)); lastAlt.current = f.alt }
          else if (lastAlt.current == null || lastAlt.current - f.alt >= 3) lastAlt.current = f.alt
        }
        if (pts.current.length % 10 === 0) void db.kv.put({ k: 'rec', v: pts.current }) // por si se cierra la app
      },
      (e) => setMsg(e.code === 1 ? 'Permite la ubicación para usar Mi GPS.' : 'No encuentro señal GPS. Sal a cielo abierto.'),
      { enableHighAccuracy: !saver, maximumAge: saver ? 15000 : 1000, timeout: 30000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [saver, rec])

  // Brújula del móvil (cuando no te mueves, el GPS no da rumbo)
  useEffect(() => {
    const h = (e: DeviceOrientationEvent & { webkitCompassHeading?: number }) => {
      const v = e.webkitCompassHeading ?? (e.alpha != null ? (360 - e.alpha) % 360 : null)
      if (v != null) setCompassDeg(Math.round(v))
    }
    window.addEventListener('deviceorientationabsolute', h as EventListener, true)
    window.addEventListener('deviceorientation', h as EventListener, true)
    return () => { window.removeEventListener('deviceorientationabsolute', h as EventListener, true); window.removeEventListener('deviceorientation', h as EventListener, true) }
  }, [])

  // Pantalla encendida
  useEffect(() => {
    if (!awake) return
    let lock: { release: () => Promise<void> } | null = null
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock
    wl?.request('screen').then((l) => (lock = l)).catch(() => {})
    return () => { void lock?.release() }
  }, [awake])

  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i) }, [])

  const heading = fix?.speed && fix.speed > 0.8 && fix.heading != null ? fix.heading : compassDeg
  const me = fix ? { lng: fix.lng, lat: fix.lat, heading } : null

  const startRec = () => { pts.current = []; lastAlt.current = null; setDist(0); setAsc(0); setT0(Date.now()); setRec(true) }
  const stopRec = async () => {
    setRec(false)
    if (pts.current.length > 5) await db.tracks.add({ id: crypto.randomUUID(), name: `Recorrido ${new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`, coords: pts.current, at: Date.now(), source: 'rec' })
    pts.current = []
    await db.kv.delete('rec')
    setMsg('Recorrido guardado: lo tienes en el mapa y en Exportar GPX.')
  }
  const markCar = async () => { if (fix) { await db.kv.put({ k: 'car', v: { lat: fix.lat, lng: fix.lng } }); setMsg('Coche marcado aquí.') } }
  const goCar = useCallback(async () => {
    if (!fix || !car) return
    setMsg('Calculando el camino de vuelta…')
    const r = await computeRoute([fix.lat, fix.lng], [car.lat, car.lng], 'directo')
    if (r.ok) { setBack(r.coords); setMsg('') } else setMsg(`${r.error}. Sigue la flecha hacia el coche.`)
  }, [fix, car])
  const importGpx = async (f: File) => {
    try {
      const { tracks: tk } = parseGpx(await f.text())
      if (!tk[0]) { setMsg('Ese GPX no tiene un recorrido.'); return }
      setFollow2(tk[0].coords as Pt[]); setMsg(`Siguiendo «${tk[0].name}». Te aviso si te sales del camino.`)
    } catch (e) { setMsg((e as Error).message) }
  }

  // Salida del camino (GPX seguido o camino de vuelta)
  const line = follow2 ?? back
  const off = useMemo(() => (fix && line && line.length > 1 ? projectOnLine(line, fix.lat, fix.lng) : null), [fix, line])
  const offPath = !!off && off.d > 45 && (fix?.acc ?? 0) < 80

  // Más cercanos
  const nearest = useMemo(() => {
    if (!fix) return []
    const pick = (pred: (p: Place) => boolean) => places.filter(pred).map((p) => ({ p, d: haversine(fix.lat, fix.lng, p.lat, p.lng) })).sort((a, b) => a.d - b.d)[0]
    return [pick((p) => SLEEP_KINDS.includes(p.kind) && p.kind !== 'vivac' && p.kind !== 'deseo'), pick((p) => p.kind === 'fuente'), pick((p) => p.kind === 'parking')].filter(Boolean) as Array<{ p: Place; d: number }>
  }, [fix, places])

  const elapsed = rec && t0 ? fmtDur((now - t0) / 60000) : '—'
  const allTracks = useMemo(() => [...tracks.map((t) => t.coords), ...(follow2 ? [follow2] : [])], [tracks, follow2])
  const copyCoords = () => fix && navigator.clipboard?.writeText(`${fix.lat.toFixed(5)}, ${fix.lng.toFixed(5)}`)
  const utm = fix ? toUTM(fix.lat, fix.lng) : null
  const btn = 'tap flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-xs font-bold'

  return (
    <div className="fixed inset-0 z-[85] flex flex-col" style={{ background: 'var(--bg)' }} role="dialog" aria-label="Mi GPS">
      <div className="relative min-h-0 flex-[1.1]">
        <Suspense fallback={<div className="grid h-full place-items-center">Cargando mapa…</div>}>
          <MapView places={places.filter((p) => SLEEP_KINDS.includes(p.kind) || p.kind === 'fuente' || p.kind === 'parking')} onSelect={() => {}} is3D={false} layer={layer} trails me={me} follow={follow} route={back} tracks={allTracks as [number, number, number?][][]} controls={false} initialCenter={fix ? [fix.lng, fix.lat] : [-3.97, 40.8]} initialZoom={fix ? 15 : 10} />
        </Suspense>
        <button onClick={onClose} aria-label="Cerrar Mi GPS" className="tap absolute left-3 grid h-12 w-12 place-items-center rounded-full shadow-lg" style={{ top: 'calc(var(--safe-t) + 10px)', background: 'var(--surface)' }}><X size={22} /></button>
        <div className="absolute right-3 flex flex-col gap-2" style={{ top: 'calc(var(--safe-t) + 10px)' }}>
          {([['vec', 'Mapa'], ['mtn', 'Topo'], ['pnoa', 'Satélite']] as const).map(([k, l]) => <button key={k} aria-pressed={layer === k} onClick={() => setLayer(k)} className="tap rounded-full px-4 text-sm font-bold shadow-lg" style={{ background: layer === k ? 'var(--accent)' : 'var(--surface)', color: layer === k ? '#fff' : 'var(--ink)' }}>{l}</button>)}
          <button aria-pressed={follow} aria-label="Seguirme" onClick={() => setFollow(!follow)} className="tap grid h-12 w-12 place-items-center rounded-full shadow-lg" style={{ background: follow ? 'var(--accent)' : 'var(--surface)', color: follow ? '#fff' : 'var(--ink)' }}><LocateFixed size={22} /></button>
        </div>
        {(offPath || msg) && (
          <div role="alert" className="absolute inset-x-3 rounded-2xl p-3 text-sm font-bold shadow-xl" style={{ top: 'calc(var(--safe-t) + 70px)', background: offPath ? '#d1553f' : '#1b2c44', color: '#fff' }}>
            {offPath ? `⚠️ Te has salido del camino (${Math.round(off!.d)} m). Vuelve hacia la línea naranja.` : msg}
          </div>
        )}
      </div>

      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-3" style={{ paddingBottom: 'calc(var(--safe-b) + 14px)' }}>
        {ios && <p className="mb-2 rounded-2xl p-2 text-xs font-semibold" style={{ background: '#e5b23a33' }}>En iPhone el GPS se para si apagas la pantalla o sales de la app. Deja la pantalla encendida (activada abajo) para no perder el recorrido.</p>}
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            [fix?.alt != null ? `${Math.round(fix.alt)} m` : '—', 'altitud'],
            [rec ? km(dist) : '—', 'recorrido'],
            [rec ? `+${Math.round(asc)} m` : '—', 'desnivel'],
            [elapsed, 'tiempo'],
          ].map(([v, l]) => <div key={l} className="rounded-2xl p-2" style={{ background: 'var(--surface)' }}><p className="font-display text-xl font-bold leading-tight">{v}</p><p className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>{l}</p></div>)}
        </div>

        <div className="mt-2 grid grid-cols-4 gap-2">
          {rec
            ? <button onClick={stopRec} className={btn} style={{ background: '#d1553f', color: '#fff' }}><Flag size={20} />Parar</button>
            : <button onClick={startRec} className={btn} style={{ background: 'var(--accent)', color: '#fff' }}><Circle size={20} />Grabar</button>}
          <button onClick={markCar} className={btn} style={{ background: 'var(--surface)' }}><Car size={20} />Marcar coche</button>
          <button onClick={goCar} disabled={!car || !fix} className={`${btn} disabled:opacity-40`} style={{ background: 'var(--surface)' }}><Navigation2 size={20} />Volver al coche</button>
          <label className={btn + ' cursor-pointer'} style={{ background: 'var(--surface)' }}><FileUp size={20} />Seguir GPX<input type="file" accept=".gpx" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importGpx(f); e.target.value = '' }} /></label>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button aria-pressed={saver} onClick={() => setSaver(!saver)} className={btn} style={{ background: saver ? 'var(--accent)' : 'var(--surface)', color: saver ? '#fff' : 'var(--ink)' }}><BatteryLow size={20} />Ahorro de batería</button>
          <button aria-pressed={awake} onClick={() => setAwake(!awake)} className={btn} style={{ background: awake ? 'var(--accent)' : 'var(--surface)', color: awake ? '#fff' : 'var(--ink)' }}><Sun size={20} />Pantalla encendida</button>
        </div>
        {car && back && off && <p className="mt-2 text-sm font-semibold">🚗 Al coche: quedan {km(Math.max(0, off.total - off.along))}</p>}

        <h3 className="mb-1 mt-3 flex items-center gap-2 text-sm font-bold"><MapPinned size={16} />Lo más cercano</h3>
        <ul className="flex flex-col gap-1.5">
          {nearest.map(({ p, d }) => (
            <li key={p.id} className="flex items-center justify-between gap-2 rounded-2xl p-2.5 text-sm" style={{ background: 'var(--surface)' }}>
              <span className="min-w-0"><b className="block truncate">{p.name}</b><span className="text-xs" style={{ color: 'var(--ink-soft)' }}>{KIND_LABEL[p.kind]}</span></span>
              <span className="shrink-0 text-right font-bold">{km(d)}<span className="block text-xs font-normal" style={{ color: 'var(--ink-soft)' }}>hacia el {compass(bearing(fix!.lat, fix!.lng, p.lat, p.lng))}</span></span>
            </li>
          ))}
          {!nearest.length && <li className="text-sm" style={{ color: 'var(--ink-soft)' }}>Esperando el GPS…</li>}
        </ul>

        <h3 className="mb-1 mt-3 flex items-center gap-2 text-sm font-bold"><Crosshair size={16} />Dónde estoy</h3>
        <div className="rounded-2xl p-3 text-sm" style={{ background: 'var(--surface)', userSelect: 'text' }}>
          {fix && utm ? (
            <>
              <p><b>{fix.lat.toFixed(5)}, {fix.lng.toFixed(5)}</b> <span style={{ color: 'var(--ink-soft)' }}>(±{Math.round(fix.acc)} m)</span></p>
              <p className="mt-0.5">{toDMS(fix.lat, 'N', 'S')} · {toDMS(fix.lng, 'E', 'O')}</p>
              <p className="mt-0.5">UTM {utm.zone}{utm.band} · E {utm.e} · N {utm.n}</p>
              <button onClick={copyCoords} className="tap mt-2 inline-flex items-center gap-2 rounded-xl px-3 text-xs font-bold" style={{ background: 'var(--bg)' }}><Copy size={14} />Copiar coordenadas</button>
            </>
          ) : 'Buscando GPS…'}
        </div>
        <p className="mt-2 flex items-center gap-1 text-[11px]" style={{ color: 'var(--ink-soft)' }}><Mountain size={12} />Caminos: pistas marrones, senderos naranjas, senderos difíciles rojos; GR rojo, PR amarillo, SL verde.</p>
      </div>
    </div>
  )
}
