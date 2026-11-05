import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Drawer } from 'vaul'
import { BatteryLow, Compass, Flag, LifeBuoy, Loader2, Moon, Route, TriangleAlert } from 'lucide-react'
import { accessFor } from '../lib/access'
import { db } from '../lib/db'
import { fmtDur, haversine } from '../lib/geo'
import type { Ctx } from '../lib/plan'
import { useRoute, walkTimeMin, type Profile, type RouteResult } from '../lib/router'
import type { Place } from '../lib/types'

type Pt = [number, number, number]

/** Punto más cercano de la ruta a la posición actual: devuelve índice del segmento, distancia lateral y metros recorridos. */
function project(route: Pt[], cum: number[], lat: number, lng: number) {
  const k = Math.cos((lat * Math.PI) / 180) * 111320
  let best = { d: Infinity, i: 0, along: 0 }
  for (let i = 1; i < route.length; i++) {
    const ax = (route[i - 1][0] - lng) * k, ay = (route[i - 1][1] - lat) * 111320
    const bx = (route[i][0] - lng) * k, by = (route[i][1] - lat) * 111320
    const dx = bx - ax, dy = by - ay
    const l2 = dx * dx + dy * dy
    const t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0
    const d = Math.hypot(ax + t * dx, ay + t * dy)
    if (d < best.d) best = { d, i, along: cum[i - 1] + t * (cum[i] - cum[i - 1]) }
  }
  return best
}

function Elevation({ r, onCursor }: { r: RouteResult; onCursor: (c: [number, number] | null) => void }) {
  const W = 340, H = 110, pl = 30, pb = 18
  const total = r.profile[r.profile.length - 1][0] || 1
  const els = r.profile.map((p) => p[1])
  const lo = Math.floor(Math.min(...els) / 10) * 10, hi = Math.ceil(Math.max(...els) / 10) * 10 || lo + 10
  const X = (d: number) => pl + (d / total) * (W - pl - 6)
  const Y = (e: number) => 6 + (1 - (e - lo) / (hi - lo || 1)) * (H - 6 - pb)
  const path = r.profile.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join('')
  const [mark, setMark] = useState<number | null>(null)
  const move = (ev: React.PointerEvent<SVGSVGElement>) => {
    const b = ev.currentTarget.getBoundingClientRect()
    const x = ((ev.clientX - b.left) / b.width) * W
    const d = Math.max(0, Math.min(total, ((x - pl) / (W - pl - 6)) * total))
    setMark(d)
    let i = r.profile.findIndex((p) => p[0] >= d)
    if (i < 0) i = r.profile.length - 1
    onCursor([r.coords[i][0], r.coords[i][1]])
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full touch-none" onPointerDown={move} onPointerMove={(e) => e.buttons && move(e)} onPointerUp={() => { setMark(null); onCursor(null) }} onPointerLeave={() => { setMark(null); onCursor(null) }} role="img" aria-label="Perfil de elevación de la ruta">
      <path d={`${path}L${X(total)} ${H - pb}L${pl} ${H - pb}Z`} fill="#e08a35" opacity=".18" />
      <path d={path} fill="none" stroke="#e08a35" strokeWidth="2.6" strokeLinejoin="round" />
      <text x="0" y="12" fontSize="10" fill="var(--ink-soft)">{hi}</text>
      <text x="0" y={H - pb} fontSize="10" fill="var(--ink-soft)">{lo}</text>
      <text x={pl} y={H - 4} fontSize="10" fill="var(--ink-soft)">0</text>
      <text x={W - 6} y={H - 4} fontSize="10" textAnchor="end" fill="var(--ink-soft)">{(total / 1000).toFixed(1)} km</text>
      {mark != null && <line x1={X(mark)} x2={X(mark)} y1="4" y2={H - pb} stroke="var(--ink)" strokeWidth="1.5" />}
    </svg>
  )
}

interface Props {
  target: Place | null
  places: Place[]
  ctx: Ctx
  onClose: () => void
  onRoute: (r: Pt[] | null) => void
  onCursor: (c: [number, number] | null) => void
}

export default function NavSheet({ target, places, ctx, onClose, onRoute, onCursor }: Props) {
  const [profile, setProfile] = useState<Profile>('directo')
  const [origin, setOrigin] = useState<{ pt: [number, number]; label: string } | null>(null)
  const [navOn, setNavOn] = useState(false)
  const [saver, setSaver] = useState(false)
  const [rec, setRec] = useState(false)
  const [pos, setPos] = useState<{ lat: number; lng: number; acc: number } | null>(null)
  const { res, busy, run, clear } = useRoute()
  const track = useRef<[number, number, number?][]>([])
  const lock = useRef<{ release: () => Promise<void> } | null>(null)
  const [dest, setDest] = useState<Place | null>(target)

  useEffect(() => { setDest(target); setNavOn(false); clear() }, [target?.id])  // eslint-disable-line react-hooks/exhaustive-deps

  // Origen: tu posición si estás en la sierra; si no, el mejor aparcamiento para ese sitio.
  useEffect(() => {
    if (!dest) { setOrigin(null); return }
    const fallback = () => {
      const a = accessFor(dest, ctx.parkings, ctx.drive)[0]
      setOrigin(a ? { pt: [a.parking.lat, a.parking.lng], label: a.parking.name } : null)
    }
    if (!navigator.geolocation) return fallback()
    navigator.geolocation.getCurrentPosition(
      (p) => (haversine(p.coords.latitude, p.coords.longitude, dest.lat, dest.lng) < 40000 ? setOrigin({ pt: [p.coords.latitude, p.coords.longitude], label: 'Tu posición' }) : fallback()),
      fallback, { timeout: 6000, maximumAge: 60000 },
    )
  }, [dest?.id])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (dest && origin) void run(origin.pt, [dest.lat, dest.lng], profile)
  }, [dest, origin, profile, run])

  const r = res?.ok ? res : null
  const coords = r?.coords as Pt[] | undefined
  useEffect(() => { onRoute(coords ?? null) }, [coords, onRoute])
  const cum = useMemo(() => {
    if (!coords) return []
    const c = [0]
    for (let i = 1; i < coords.length; i++) c.push(c[i - 1] + haversine(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0]))
    return c
  }, [coords])

  // Navegación: GPS, ahorro de batería, pantalla encendida y grabación del track.
  useEffect(() => {
    if (!navOn) return
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy })
        if (rec) track.current.push([p.coords.longitude, p.coords.latitude, p.coords.altitude ?? undefined])
      },
      () => {}, { enableHighAccuracy: !saver, maximumAge: saver ? 15000 : 1000, timeout: 30000 },
    )
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock
    wl?.request('screen').then((l) => (lock.current = l)).catch(() => {})
    return () => { navigator.geolocation.clearWatch(id); void lock.current?.release(); lock.current = null }
  }, [navOn, saver, rec])

  const prog = useMemo(() => (pos && coords ? project(coords, cum, pos.lat, pos.lng) : null), [pos, coords, cum])
  const total = cum[cum.length - 1] ?? 0
  const left = prog ? Math.max(0, total - prog.along) : total
  const offRoute = !!prog && prog.d > 45 && (pos?.acc ?? 0) < 80
  const ascLeft = useMemo(() => {
    if (!coords || !prog) return r?.asc ?? 0
    let a = 0
    for (let i = prog.i + 1; i < coords.length; i++) a += Math.max(0, coords[i][2] - coords[i - 1][2])
    return a
  }, [coords, prog, r])

  const nearest = useCallback(() => {
    if (!pos) return
    const c = places.filter((p) => p.kind === 'refugio_libre' || p.kind === 'refugio_pago' || p.kind === 'parking' || p.kind === 'parapeto')
      .map((p) => ({ p, d: haversine(pos.lat, pos.lng, p.lat, p.lng) })).sort((a, b) => a.d - b.d)[0]
    if (c) { setDest(c.p); setOrigin({ pt: [pos.lat, pos.lng], label: 'Tu posición' }); setProfile('directo') }
  }, [pos, places])

  const finish = async () => {
    if (rec && track.current.length > 5) await db.tracks.add({ id: crypto.randomUUID(), name: `Hacia ${dest?.name ?? 'destino'}`, coords: track.current, at: Date.now(), source: 'rec' })
    track.current = []
    setNavOn(false); setRec(false); setPos(null)
    onRoute(null); onClose()
  }

  const mins = r ? walkTimeMin(r.dist, r.asc, r.desc) : 0
  const big = 'font-display text-4xl font-bold leading-none'

  return (
    <Drawer.Root open={!!target} onOpenChange={(o) => { if (!o && !navOn) { onRoute(null); onClose() } }} modal={false} dismissible={!navOn} snapPoints={[0.52, 0.92]} fadeFromIndex={1}>
      <Drawer.Portal>
        <Drawer.Content className="fixed inset-x-0 bottom-0 mx-auto max-w-xl z-[45] flex h-full max-h-[94%] flex-col rounded-t-3xl p-5 pb-8 shadow-2xl outline-none" style={{ background: 'var(--bg)' }}>
          <Drawer.Handle className="mb-2" />
          <Drawer.Title className="font-display text-2xl font-semibold leading-tight">{navOn ? 'Navegando' : 'Cómo llegar'}: {dest?.name}</Drawer.Title>
          <Drawer.Description className="text-sm" style={{ color: 'var(--ink-soft)' }}>{origin ? `Desde ${origin.label}` : 'Buscando punto de salida…'} · rutas sin conexión</Drawer.Description>

          {!navOn && (
            <div className="mt-3 inline-flex self-start rounded-full p-1" style={{ background: 'var(--surface)' }} role="group" aria-label="Tipo de ruta">
              {([['directo', 'Más directo', Route], ['noche', 'Llegamos de noche', Moon]] as const).map(([id, l, I]) => (
                <button key={id} aria-pressed={profile === id} onClick={() => setProfile(id)} className="tap inline-flex items-center gap-1 rounded-full px-3 text-sm font-semibold" style={{ minHeight: 40, background: profile === id ? 'var(--accent)' : 'transparent', color: profile === id ? '#fff' : 'var(--ink)' }}><I size={16} />{l}</button>
              ))}
            </div>
          )}

          <div data-vaul-no-drag className="no-scrollbar mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {busy && !r && <p className="flex items-center gap-2 py-6" style={{ color: 'var(--ink-soft)' }}><Loader2 className="animate-spin" />Calculando ruta…</p>}
            {res && !res.ok && <p className="rounded-2xl p-4 text-sm" style={{ background: '#e5b23a33' }}>{res.error}. Abre el mapa topográfico y sigue la zona a ojo, o prueba a salir de otro aparcamiento.</p>}
            {r && !navOn && (
              <>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[[(r.dist / 1000).toFixed(1), 'km'], [`+${Math.round(r.asc)}`, 'm subida'], [fmtDur(mins), 'a pie']].map(([v, l]) => <div key={l} className="rounded-2xl p-3" style={{ background: 'var(--surface)' }}><p className="font-display text-2xl font-bold">{v}</p><p className="text-xs" style={{ color: 'var(--ink-soft)' }}>{l}</p></div>)}
                </div>
                <div className="mt-3 rounded-2xl p-3" style={{ background: 'var(--surface)' }}><Elevation r={r} onCursor={onCursor} /><p className="text-xs" style={{ color: 'var(--ink-soft)' }}>Arrastra por el perfil para verlo en el mapa. Bajada: −{Math.round(r.desc)} m. Tiempo según DIN 33466, sin paradas.</p></div>
                {profile === 'noche' && <p className="mt-2 text-xs" style={{ color: 'var(--ink-soft)' }}>Ruta que prefiere pistas forestales y evita senderos difíciles, por si llegáis de noche.</p>}
              </>
            )}
            {r && navOn && (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-3xl p-4" style={{ background: 'var(--surface)' }}><p className={big}>{left >= 1000 ? `${(left / 1000).toFixed(1)} km` : `${Math.round(left)} m`}</p><p className="mt-1 text-sm" style={{ color: 'var(--ink-soft)' }}>que faltan</p></div>
                  <div className="rounded-3xl p-4" style={{ background: 'var(--surface)' }}><p className={big}>+{Math.round(ascLeft)} m</p><p className="mt-1 text-sm" style={{ color: 'var(--ink-soft)' }}>de subida</p></div>
                </div>
                {!pos && <p className="flex items-center gap-2 text-sm"><Loader2 className="animate-spin" size={16} />Buscando GPS…</p>}
                {offRoute && (
                  <div className="rounded-3xl p-4" style={{ background: '#d1553f', color: '#fff' }}>
                    <p className="flex items-center gap-2 text-lg font-bold"><TriangleAlert />Te has salido de la ruta ({Math.round(prog!.d)} m)</p>
                    <button className="tap mt-2 w-full rounded-2xl font-bold" style={{ background: '#fff', color: '#d1553f' }} onClick={() => dest && setOrigin({ pt: [pos!.lat, pos!.lng], label: 'Tu posición' })}>Recalcular desde aquí</button>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 text-sm font-semibold">
                  <button aria-pressed={saver} onClick={() => setSaver(!saver)} className="tap flex items-center justify-center gap-2 rounded-2xl py-3" style={{ background: saver ? 'var(--accent)' : 'var(--surface)', color: saver ? '#fff' : 'var(--ink)' }}><BatteryLow size={18} />Ahorro de batería</button>
                  <button aria-pressed={rec} onClick={() => setRec(!rec)} className="tap flex items-center justify-center gap-2 rounded-2xl py-3" style={{ background: rec ? '#d1553f' : 'var(--surface)', color: rec ? '#fff' : 'var(--ink)' }}><Compass size={18} />{rec ? 'Grabando track' : 'Grabar track'}</button>
                </div>
                <button onClick={nearest} disabled={!pos} className="tap flex items-center justify-center gap-2 rounded-2xl py-4 text-lg font-bold disabled:opacity-40" style={{ background: '#1b2c44', color: '#fff' }}><LifeBuoy />Llévame a lo más cercano</button>
              </div>
            )}
          </div>

          <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: navOn ? '1fr' : '1fr 2fr' }}>
            {!navOn && <button onClick={() => { onRoute(null); onClose() }} className="tap rounded-2xl font-semibold" style={{ background: 'var(--surface)' }}>Cerrar</button>}
            {navOn ? <button onClick={finish} className="tap flex items-center justify-center gap-2 rounded-2xl py-4 text-lg font-bold text-white" style={{ background: '#d1553f' }}><Flag />Terminar</button>
              : <button disabled={!r} onClick={() => setNavOn(true)} className="tap rounded-2xl py-4 text-lg font-bold text-white disabled:opacity-40" style={{ background: 'var(--accent)' }}>Empezar</button>}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
