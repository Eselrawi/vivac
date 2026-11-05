import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Drawer } from 'vaul'
import { Car, Eye, Footprints, Loader2, Moon, Route } from 'lucide-react'
import CloseBtn from './CloseBtn'
import { buildWalkLeg, type Leg } from './Navegacion'
import { accessFor } from '../lib/access'
import { driveRoute, straightRoute, type DriveRoute } from '../lib/drive'
import { bearing, fmtDur, haversine } from '../lib/geo'
import { dirName, fmtM } from '../lib/guide'
import type { Ctx } from '../lib/plan'
import { useRoute, walkTimeMin, type Profile, type RouteResult } from '../lib/router'
import type { Place } from '../lib/types'

const Navegacion = lazy(() => import('./Navegacion'))
type Pt = [number, number, number]

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

/** Vista previa de «Cómo llegar»: ruta, perfil y tramo en coche; «Empezar» abre la navegación giro a giro. */
export default function NavSheet({ target, places, ctx, onClose, onRoute, onCursor }: Props) {
  const [profile, setProfile] = useState<Profile>('directo')
  const [user, setUser] = useState<[number, number] | null | undefined>(undefined) // undefined = aún no sé
  const [full, setFull] = useState<{ legs: Leg[]; sim: boolean } | null>(null)
  const [drive, setDrive] = useState<DriveRoute | null | 'cargando'>(null)
  const { res, busy, run, clear } = useRoute()
  const dest = target

  useEffect(() => { clear(); setFull(null); setDrive(null) }, [target?.id])  // eslint-disable-line react-hooks/exhaustive-deps

  // Dónde estoy (una vez por destino).
  useEffect(() => {
    if (!dest) { setUser(undefined); return }
    if (!navigator.geolocation) { setUser(null); return }
    navigator.geolocation.getCurrentPosition((p) => setUser([p.coords.latitude, p.coords.longitude]), () => setUser(null), { timeout: 6000, maximumAge: 60000 })
  }, [dest?.id])  // eslint-disable-line react-hooks/exhaustive-deps

  const parking = useMemo(() => (dest ? accessFor(dest, ctx.parkings, ctx.drive)[0]?.parking ?? null : null), [dest, ctx.parkings, ctx.drive])
  // Si estás cerca del destino sales a pie desde donde estás; si no, a pie desde el aparcamiento (y hasta él, en coche).
  const near = !!(dest && user && haversine(user[0], user[1], dest.lat, dest.lng) < 3000)
  const walkFrom: [number, number] | null = user === undefined ? null : near && user ? user : parking ? [parking.lat, parking.lng] : user ?? null
  const needCar = !!(user && parking && !near && haversine(user[0], user[1], parking.lat, parking.lng) > 400)

  useEffect(() => {
    if (!dest || !walkFrom) return
    void run(walkFrom, [dest.lat, dest.lng], profile)
  }, [dest?.id, walkFrom?.[0], walkFrom?.[1], profile, run])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!needCar || !user || !parking) { setDrive(null); return }
    setDrive('cargando')
    let live = true
    void driveRoute(user, [parking.lat, parking.lng]).then((d) => live && setDrive(d))
    return () => { live = false }
  }, [needCar, user?.[0], user?.[1], parking?.id])  // eslint-disable-line react-hooks/exhaustive-deps

  const r = res?.ok ? res : null
  const coords = r?.coords as Pt[] | undefined
  useEffect(() => { onRoute(full ? null : coords ?? null) }, [coords, full, onRoute])

  const start = (sim: boolean) => {
    if (!r || !dest) return
    const legs: Leg[] = []
    if (needCar && user && parking) {
      const d = drive && drive !== 'cargando' ? drive : straightRoute(user,[parking.lat, parking.lng], `Ve hacia el ${dirName(bearing(user[0], user[1], parking.lat, parking.lng))}, ${fmtM(haversine(user[0], user[1], parking.lat, parking.lng))} hasta ${parking.name}`)
      legs.push({ mode: 'coche', label: parking.name, to: [parking.lat, parking.lng], coords: d.coords, steps: d.steps, dur: d.dur, approx: !(drive && drive !== 'cargando') })
    }
    legs.push(buildWalkLeg(r.coords as Pt[], dest.name, [dest.lat, dest.lng]))
    setFull({ legs, sim })
  }
  const exit = () => { setFull(null); onRoute(null); onClose() }

  const mins = r ? walkTimeMin(r.dist, r.asc, r.desc) : 0
  const driveOk = drive && drive !== 'cargando' ? drive : null

  return (
    <>
      <Drawer.Root open={!!target && !full} onOpenChange={(o) => { if (!o) exit() }} modal={false} snapPoints={[0.52, 0.92]} fadeFromIndex={1}>
        <Drawer.Portal>
          <Drawer.Content className="fixed inset-x-0 bottom-0 mx-auto max-w-xl z-[45] flex h-full max-h-[94%] flex-col rounded-t-3xl p-5 pb-8 shadow-2xl outline-none" style={{ background: 'var(--bg)' }}>
            <CloseBtn onClick={exit} />
            <Drawer.Handle className="mb-2" />
            <Drawer.Title className="pr-12 font-display text-2xl font-semibold leading-tight">Cómo llegar: {dest?.name}</Drawer.Title>
            <Drawer.Description className="text-sm" style={{ color: 'var(--ink-soft)' }}>
              {walkFrom ? (near ? 'A pie desde tu posición' : `A pie desde ${parking?.name ?? 'tu posición'}`) : 'Buscando punto de salida…'} · el tramo a pie funciona sin conexión
            </Drawer.Description>

            <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: '1fr 2fr' }}>
                            <button disabled={!r} onClick={() => start(true)} aria-label="Ver cómo sería la navegación, sin moverte" className="tap flex items-center justify-center gap-1 rounded-2xl text-sm font-semibold disabled:opacity-40" style={{ background: 'var(--surface)' }}><Eye size={18} />Vista previa</button>
              <button disabled={!r || (needCar && drive === 'cargando')} onClick={() => start(false)} className="tap rounded-2xl py-4 text-lg font-bold text-white disabled:opacity-40" style={{ background: 'var(--accent)' }}>Empezar</button>
            </div>
            <div className="mt-3 inline-flex self-start rounded-full p-1" style={{ background: 'var(--surface)' }} role="group" aria-label="Tipo de ruta">
              {([['directo', 'Más directo', Route], ['noche', 'Llegamos de noche', Moon]] as const).map(([id, l, I]) => (
                <button key={id} aria-pressed={profile === id} onClick={() => setProfile(id)} className="tap inline-flex items-center gap-1 rounded-full px-3 text-sm font-semibold" style={{ minHeight: 40, background: profile === id ? 'var(--accent)' : 'transparent', color: profile === id ? '#fff' : 'var(--ink)' }}><I size={16} />{l}</button>
              ))}
            </div>

            <div data-vaul-no-drag className="no-scrollbar mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {needCar && parking && (
                <div className="mb-3 flex items-center gap-3 rounded-2xl p-3" style={{ background: 'var(--surface)' }}>
                  <Car size={26} />
                  <div className="min-w-0 text-sm">
                    <p className="font-bold">1. En coche hasta {parking.name}</p>
                    <p style={{ color: 'var(--ink-soft)' }}>
                      {drive === 'cargando' ? 'Calculando…' : driveOk ? `${(driveOk.dist / 1000).toFixed(0)} km · ${fmtDur(driveOk.dur / 60)}` : `Sin conexión: te marco la dirección en línea recta (${fmtM(haversine(user![0], user![1], parking.lat, parking.lng))}).`}
                    </p>
                  </div>
                </div>
              )}
              {busy && !r && <p className="flex items-center gap-2 py-6" style={{ color: 'var(--ink-soft)' }}><Loader2 className="animate-spin" />Calculando ruta…</p>}
              {res && !res.ok && <p className="rounded-2xl p-4 text-sm" style={{ background: '#e5b23a33' }}>{res.error}. Abre el mapa topográfico y sigue la zona a ojo, o prueba a salir de otro aparcamiento.</p>}
              {r && (
                <>
                  <p className="mb-2 flex items-center gap-2 text-sm font-bold"><Footprints size={18} />{needCar ? '2. A pie hasta el sitio' : 'A pie'}</p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[[(r.dist / 1000).toFixed(1), 'km'], [`+${Math.round(r.asc)}`, 'm subida'], [fmtDur(mins), 'a pie']].map(([v, l]) => <div key={l} className="rounded-2xl p-3" style={{ background: 'var(--surface)' }}><p className="font-display text-2xl font-bold">{v}</p><p className="text-xs" style={{ color: 'var(--ink-soft)' }}>{l}</p></div>)}
                  </div>
                  <div className="mt-3 rounded-2xl p-3" style={{ background: 'var(--surface)' }}><Elevation r={r} onCursor={onCursor} /><p className="text-xs" style={{ color: 'var(--ink-soft)' }}>Arrastra por el perfil para verlo en el mapa. Bajada: −{Math.round(r.desc)} m. Tiempo según DIN 33466, sin paradas.</p></div>
                  {profile === 'noche' && <p className="mt-2 text-xs" style={{ color: 'var(--ink-soft)' }}>Ruta que prefiere pistas forestales y evita senderos difíciles, por si llegáis de noche.</p>}
                  <p className="mt-2 text-xs" style={{ color: 'var(--ink-soft)' }}>Las indicaciones a pie salen de la forma del camino (giros y cruces); los senderos no tienen nombre en los datos, así que oirás «gira a la derecha», no el nombre del sendero.</p>
                </>
              )}
            </div>

          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
      {full && dest && <Suspense fallback={null}><Navegacion legs={full.legs} dest={dest} places={places} simulate={full.sim} onClose={exit} /></Suspense>}
    </>
  )
}
