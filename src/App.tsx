import { useCallback, useEffect, useMemo, useState } from 'react'
import { User } from 'lucide-react'
import BottomNav, { type Tab } from './components/BottomNav'
import Fab from './components/Fab'
import PlaceSheet from './components/PlaceSheet'
import PlanSheet from './components/PlanSheet'
import Welcome, { WELCOME_KEY } from './components/Welcome'
import ProfileSheet from './components/ProfileSheet'
import RecordSheet from './components/RecordSheet'
import Dormir from './tabs/Dormir'
import Mapa from './tabs/Mapa'
import { Diario } from './tabs/Simple'
import Mochila from './tabs/Mochila'
import { useCatalog } from './lib/catalog'
import { useAccount } from './lib/auth'
import { askPersistent, db, recordToPlace, useLive } from './lib/db'
import { haversine } from './lib/geo'
import { useDays, useDrive, useOverrides, type Ctx } from './lib/plan'
import { usePrefs } from './lib/prefs'
import { SLEEP_KINDS, type Place } from './lib/types'
import { useWeather } from './lib/weather'

export default function App() {
  const [tab, setTab] = useState<Tab>('dormir')
  const [selected, setSelected] = useState<Place | null>(null)
  const [plan, setPlan] = useState<Place | null>(null)
  const [dayIdx, setDayIdx] = useState(0)
  const acc = useAccount()
  const [profile, setProfile] = useState(false)
  const [welcome, setWelcome] = useState(() => !localStorage.getItem(WELCOME_KEY))
  const [rec, setRec] = useState<'vivac' | 'deseo' | null>(null)

  const prefs = usePrefs()
  const ovr = useOverrides()
  const days = useDays(10)
  const catalog = useCatalog()
  const mine = useLive(async () => (await db.vivacs.toArray()).map(recordToPlace), [] as Place[])

  const places = useMemo(() => {
    const base = catalog.map((p) => {
      const o = ovr[p.id]
      const visited = mine.filter((m) => m.kind === 'vivac' && haversine(m.lat, m.lng, p.lat, p.lng) < 300).length
      return { ...p, ...o, visited: visited || undefined }
    })
    return [...base, ...mine]
  }, [catalog, mine, ovr])

  const parkings = useMemo(() => places.filter((p) => p.kind === 'parking'), [places])
  const drive = useDrive(prefs, parkings)
  const wxPlaces = useMemo(() => catalog.filter((p) => SLEEP_KINDS.includes(p.kind) || p.kind === 'parking'), [catalog])
  const weather = useWeather(wxPlaces)
  const ctx: Ctx = useMemo(() => ({ wx: weather.wx, parkings, drive, prefs }), [weather.wx, parkings, drive, prefs])

  useEffect(() => { askPersistent() }, [])
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
  const route = (p: Place) => window.open(`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=walking`, '_blank')

  return (
    <div className="relative h-full overflow-hidden">
      <main className="absolute inset-0 overflow-y-auto" hidden={tab === 'mapa'}>
        {tab === 'dormir' && <Dormir places={places} days={days} dayIdx={dayIdx} onDay={setDayIdx} ctx={ctx} status={weather} onOpen={open} />}
        {tab === 'diario' && <Diario />}
        {tab === 'mochila' && <Mochila places={places} ctx={ctx} />}
      </main>
      <div className="absolute inset-0" style={{ visibility: tab === 'mapa' ? 'visible' : 'hidden' }}>
        <Mapa places={places} selectedId={selected?.id ?? null} onSelect={setSelected} />
      </div>
      {(tab === 'dormir' || tab === 'mapa') && <Fab onPick={(id) => id !== 'refugio' && setRec(id === 'ir' ? 'deseo' : 'vivac')} />}
      <button aria-label="Perfil" onClick={() => setProfile(true)} className="tap fixed left-3 z-20 grid h-11 w-11 place-items-center rounded-full shadow-lg" style={{ top: 'calc(var(--safe-t) + 12px)', background: acc.session ? 'var(--accent)' : 'var(--surface)', color: acc.session ? '#fff' : 'var(--ink)' }}><User size={22} /></button>
      <ProfileSheet open={profile} onClose={() => setProfile(false)} acc={acc} onWelcome={() => setWelcome(true)} />
      {welcome && <Welcome onDone={() => setWelcome(false)} onJoin={() => setProfile(true)} />}
      <RecordSheet mode={rec} onClose={() => setRec(null)} />
      <PlaceSheet place={selected && places.find((p) => p.id === selected.id) || selected} days={days} dayIdx={dayIdx} ctx={ctx} onDay={setDayIdx} onClose={() => setSelected(null)} onRoute={route} onPlan={(p) => { setPlan(p); setSelected(null) }} />
      <PlanSheet place={plan} day={days[dayIdx]} ctx={ctx} onClose={() => setPlan(null)} />
      <BottomNav tab={tab} onChange={go} />
    </div>
  )
}
