import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { User } from 'lucide-react'
import BottomNav, { type Tab } from './components/BottomNav'
import Fab from './components/Fab'
import PlaceSheet from './components/PlaceSheet'
import { WELCOME_KEY } from './lib/platform'
import RecordSheet from './components/RecordSheet'
import Dormir from './tabs/Dormir'
import { useCatalog } from './lib/catalog'
import { useAccount } from './lib/auth'
import { askPersistent, db, recordToPlace, useLive, type TrackRecord, type VivacRecord } from './lib/db'
import { haversine } from './lib/geo'
import { useDays, useDrive, useOverrides, type Ctx } from './lib/plan'
import { usePrefs } from './lib/prefs'
import { SLEEP_KINDS, type Place } from './lib/types'
import { useWeather } from './lib/weather'

const Mapa = lazy(() => import('./tabs/Mapa'))
const Diario = lazy(() => import('./tabs/Diario'))
const Mochila = lazy(() => import('./tabs/Mochila'))
const NavSheet = lazy(() => import('./components/NavSheet'))
const PlanSheet = lazy(() => import('./components/PlanSheet'))
const ProfileSheet = lazy(() => import('./components/ProfileSheet'))
const AddPlaceSheet = lazy(() => import('./components/AddPlaceSheet'))
const Welcome = lazy(() => import('./components/Welcome'))

/** Monta un panel la primera vez que hace falta y lo deja montado (para que cierre con animación). */
function useSeen(flag: boolean) {
  const [seen, setSeen] = useState(flag)
  useEffect(() => { if (flag) setSeen(true) }, [flag])
  return seen || flag
}

export default function App() {
  const [tab, setTab] = useState<Tab>('dormir')
  const [mapSeen, setMapSeen] = useState(false)
  useEffect(() => { if (tab === 'mapa') setMapSeen(true) }, [tab])
  const [selected, setSelected] = useState<Place | null>(null)
  const [plan, setPlan] = useState<Place | null>(null)
  const [navTarget, setNavTarget] = useState<Place | null>(null)
  const [routeLine, setRouteLine] = useState<[number, number, number][] | null>(null)
  const [cursor, setCursor] = useState<[number, number] | null>(null)
  const [dayIdx, setDayIdx] = useState(0)
  const acc = useAccount()
  const [profile, setProfile] = useState(false)
  const [welcome, setWelcome] = useState(() => !localStorage.getItem(WELCOME_KEY))
  const [rec, setRec] = useState<'vivac' | 'deseo' | null>(null)
  const [addPlace, setAddPlace] = useState(false)
  const [diaryFocus, setDiaryFocus] = useState<string | null>(null)

  const prefs = usePrefs()
  const ovr = useOverrides()
  const days = useDays(10)
  const catalog = useCatalog()
  const trackRows = useLive<TrackRecord[]>(() => db.tracks.toArray(), [])
  const tracks = useMemo(() => trackRows.map((t) => t.coords), [trackRows])
  const mine = useLive(async () => (await db.vivacs.toArray()).map(recordToPlace), [] as Place[])

  const places = useMemo(() => {
    const base = catalog.filter((p) => p.kind !== 'candidato' || prefs.discover).map((p) => {
      const o = ovr[p.id]
      const visited = mine.filter((m) => m.kind === 'vivac' && haversine(m.lat, m.lng, p.lat, p.lng) < 300).length
      return { ...p, ...o, visited: visited || undefined }
    })
    return [...base, ...mine]
  }, [catalog, mine, ovr, prefs.discover])

  const parkings = useMemo(() => places.filter((p) => p.kind === 'parking'), [places])
  const drive = useDrive(prefs, parkings)
  const wxPlaces = useMemo(() => catalog.filter((p) => SLEEP_KINDS.includes(p.kind) || p.kind === 'candidato' || p.kind === 'parking'), [catalog])
  const weather = useWeather(wxPlaces)
  const ctx: Ctx = useMemo(() => ({ wx: weather.wx, parkings, drive, prefs }), [weather.wx, parkings, drive, prefs])

  const vivacRows = useLive<VivacRecord[]>(() => db.vivacs.where('kind').equals('vivac').toArray(), [])
  const toRate = useMemo(() => vivacRows.filter((v) => !v.sleep && Date.now() - v.at > 8 * 3600000 && Date.now() - v.at < 5 * 86400000).sort((x, y) => y.at - x.at)[0], [vivacRows])
  const [dismissed, setDismissed] = useState<string | null>(null)
  const trip = useLive<{ placeId: string; date: string } | undefined>(async () => (await db.kv.get('trip'))?.v as { placeId: string; date: string } | undefined, undefined)
  const tomorrow = useMemo(() => { if (!trip) return null; const d = new Date(trip.date); const t = new Date(); t.setDate(t.getDate() + 1); return d.toDateString() === t.toDateString() ? catalog.find((p) => p.id === trip.placeId) ?? mine.find((p) => p.id === trip.placeId) ?? null : null }, [trip, catalog, mine])
  useEffect(() => {
    if (!toRate || !('Notification' in window) || Notification.permission !== 'granted') return
    const k = `vivac.notified.${toRate.id}`
    if (localStorage.getItem(k)) return
    localStorage.setItem(k, '1')
    navigator.serviceWorker?.ready.then((r) => r.showNotification('¿Qué tal durmieron?', { body: `Completa tu vivac en ${toRate.name}: valoración y notas.`, icon: `${import.meta.env.BASE_URL}icon-192.png` })).catch(() => {})
  }, [toRate])
  useEffect(() => { askPersistent() }, [])
  // Con buena conexión, guardo el mapa de caminos para poder calcular rutas sin cobertura.
  useEffect(() => {
    const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
    if (!navigator.onLine || c?.saveData || (c?.effectiveType && c.effectiveType !== '4g')) return
    const t = setTimeout(() => { void fetch(`${import.meta.env.BASE_URL}data/graph.json`).catch(() => {}) }, 12000)
    return () => clearTimeout(t)
  }, [])
  useEffect(() => {
    const dark = matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const t = prefs.theme === 'auto' ? (dark.matches ? 'dark' : 'light') : prefs.theme === 'oscuro' ? 'dark' : prefs.theme === 'rojo' ? 'rojo' : 'light'
      document.documentElement.setAttribute('data-theme', t)
      document.querySelector('meta[name=theme-color]')?.setAttribute('content', t === 'light' ? '#f6f4ef' : t === 'rojo' ? '#100303' : '#0e1b2c')
    }
    apply()
    dark.addEventListener('change', apply)
    return () => dark.removeEventListener('change', apply)
  }, [prefs.theme])

  const go = useCallback((t: Tab) => {
    const apply = () => setTab(t)
    const d = document as Document & { startViewTransition?: (cb: () => void) => void }
    if (d.startViewTransition) d.startViewTransition(apply)
    else apply()
  }, [])

  const open = (p: Place) => setSelected(p)
  useEffect(() => {
    const h = (e: Event) => { const p = places.find((x) => x.id === (e as CustomEvent<string>).detail); if (p) setSelected(p) }
    window.addEventListener('vivac-open', h)
    return () => window.removeEventListener('vivac-open', h)
  }, [places])
  const route = (p: Place) => { setNavTarget(p); setSelected(null); go('mapa') }

  return (
    <div className="relative h-full overflow-hidden">
      {tab !== 'mapa' && <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-10" style={{ height: 'calc(var(--safe-t) + 70px)', background: 'linear-gradient(var(--bg) 60%, transparent)' }} />}
      <main className="absolute inset-0 overflow-y-auto" hidden={tab === 'mapa'}>
        {tab === 'dormir' && <Dormir places={places} days={days} dayIdx={dayIdx} onDay={setDayIdx} ctx={ctx} status={weather} onOpen={open} />}
        {tab === 'diario' && <Suspense fallback={null}><Diario places={places} focusId={diaryFocus} onFocused={() => setDiaryFocus(null)} /></Suspense>}
        {tab === 'mochila' && <Suspense fallback={null}><Mochila places={places} ctx={ctx} /></Suspense>}
      </main>
      {mapSeen && (
        <div className="absolute inset-0" style={{ visibility: tab === 'mapa' ? 'visible' : 'hidden' }}>
          <Suspense fallback={<div className="grid h-full place-items-center">Cargando mapa…</div>}>
            <Mapa places={places} selectedId={selected?.id ?? navTarget?.id ?? null} onSelect={setSelected} route={routeLine} cursor={cursor} tracks={tracks} ctx={ctx} onGo={route} />
          </Suspense>
        </div>
      )}
      {(tab === 'dormir' || tab === 'mapa') && <Fab onPick={(id) => (id === 'refugio' ? setAddPlace(true) : setRec(id === 'ir' ? 'deseo' : 'vivac'))} />}
      <button aria-label="Perfil" onClick={() => setProfile(true)} className="tap fixed left-3 z-20 grid h-11 w-11 place-items-center rounded-full shadow-lg" style={{ top: 'calc(var(--safe-t) + 12px)', background: acc.session ? 'var(--accent)' : 'var(--surface)', color: acc.session ? '#fff' : 'var(--ink)' }}><User size={22} /></button>
      {tomorrow && !toRate && !welcome && dismissed !== 'trip' && (
        <div role="status" className="fixed inset-x-3 z-20 mx-auto flex max-w-md items-center gap-3 rounded-2xl p-3 shadow-xl" style={{ top: 'calc(var(--safe-t) + 62px)', background: '#1b2c44', color: '#fff' }}>
          <span className="flex-1 text-sm font-semibold">Mañana salís a {tomorrow.name}. ¿Mochila lista?</span>
          <button className="tap rounded-xl bg-white px-3 font-bold" style={{ color: '#1b2c44' }} onClick={() => go('mochila')}>Ver lista</button>
          <button aria-label="Cerrar aviso" className="tap px-2" onClick={() => setDismissed('trip')}>✕</button>
        </div>
      )}
      {toRate && dismissed !== toRate.id && !welcome && (
        <div role="status" className="fixed inset-x-3 z-20 mx-auto flex max-w-md items-center gap-3 rounded-2xl p-3 shadow-xl" style={{ top: 'calc(var(--safe-t) + 62px)', background: 'var(--accent)', color: '#fff' }}>
          <span className="flex-1 text-sm font-semibold">¿Qué tal se durmió en {toRate.name}? Cuéntalo en 10 segundos.</span>
          <button className="tap rounded-xl bg-white px-3 font-bold" style={{ color: 'var(--accent)' }} onClick={() => { setDiaryFocus(toRate.id); go('diario') }}>Valorar</button>
          <button aria-label="Cerrar aviso" className="tap px-2" onClick={() => setDismissed(toRate.id)}>✕</button>
        </div>
      )}
      {useSeen(profile) && <Suspense fallback={null}><ProfileSheet open={profile} onClose={() => setProfile(false)} acc={acc} onWelcome={() => setWelcome(true)} /></Suspense>}
      {welcome && <Suspense fallback={null}><Welcome onDone={() => setWelcome(false)} onJoin={() => setProfile(true)} /></Suspense>}
      <RecordSheet mode={rec} onClose={() => setRec(null)} places={places} />
      {useSeen(addPlace) && <Suspense fallback={null}><AddPlaceSheet open={addPlace} onClose={() => setAddPlace(false)} /></Suspense>}
      <PlaceSheet places={places} place={selected && places.find((p) => p.id === selected.id) || selected} days={days} dayIdx={dayIdx} ctx={ctx} onDay={setDayIdx} onClose={() => setSelected(null)} onRoute={route} onPlan={(p) => { setPlan(p); setSelected(null) }} />
      {useSeen(!!navTarget) && <Suspense fallback={null}><NavSheet target={navTarget} places={places} ctx={ctx} onClose={() => setNavTarget(null)} onRoute={setRouteLine} onCursor={setCursor} /></Suspense>}
      {useSeen(!!plan) && <Suspense fallback={null}><PlanSheet place={plan} day={days[dayIdx]} ctx={ctx} onClose={() => setPlan(null)} /></Suspense>}
      <BottomNav tab={tab} onChange={go} />
    </div>
  )
}
