import { useCallback, useEffect, useMemo, useState } from 'react'
import BottomNav, { type Tab } from './components/BottomNav'
import Fab from './components/Fab'
import PlaceSheet from './components/PlaceSheet'
import Dormir from './tabs/Dormir'
import Mapa from './tabs/Mapa'
import { Diario, Mochila } from './tabs/Simple'
import ProfileSheet from './components/ProfileSheet'
import { useAccount } from './lib/auth'
import { User } from 'lucide-react'
import RecordSheet from './components/RecordSheet'
import { SEED } from './data/seed'
import { askPersistent, db, recordToPlace, useLive } from './lib/db'
import type { Place } from './lib/types'

export default function App() {
  const [tab, setTab] = useState<Tab>('dormir')
  const [selected, setSelected] = useState<Place | null>(null)
  const acc = useAccount()
  const [profile, setProfile] = useState(false)
  const [rec, setRec] = useState<'vivac' | 'deseo' | null>(null)
  const mine = useLive(async () => (await db.vivacs.toArray()).map(recordToPlace), [] as Place[])
  const places = useMemo(() => [...SEED, ...mine], [mine])
  useEffect(() => { askPersistent() }, [])

  const go = useCallback((t: Tab) => {
    const apply = () => setTab(t)
    const d = document as Document & { startViewTransition?: (cb: () => void) => void }
    if (d.startViewTransition) d.startViewTransition(apply)
    else apply()
  }, [])

  const open = (p: Place) => {
    setSelected(p)
    if (tab !== 'mapa') go('mapa')
  }

  return (
    <div className="relative h-full overflow-hidden">
      <main className="absolute inset-0 overflow-y-auto" hidden={tab === 'mapa'}>
        {tab === 'dormir' && <Dormir places={places} onOpen={open} />}
        {tab === 'diario' && <Diario />}
        {tab === 'mochila' && <Mochila />}
      </main>
      <div className="absolute inset-0" style={{ visibility: tab === 'mapa' ? 'visible' : 'hidden' }}>
        <Mapa places={places} selectedId={selected?.id ?? null} onSelect={setSelected} />
      </div>
      {(tab === 'dormir' || tab === 'mapa') && <Fab onPick={(id) => id !== 'refugio' && setRec(id === 'ir' ? 'deseo' : 'vivac')} />}
      <button aria-label="Perfil" onClick={() => setProfile(true)} className="tap fixed left-3 z-20 grid h-11 w-11 place-items-center rounded-full shadow-lg" style={{ top: 'calc(var(--safe-t) + 12px)', background: acc.session ? 'var(--accent)' : 'var(--surface)', color: acc.session ? '#fff' : 'var(--ink)' }}><User size={22} /></button>
      <ProfileSheet open={profile} onClose={() => setProfile(false)} acc={acc} />
      <RecordSheet mode={rec} onClose={() => setRec(null)} />
      <PlaceSheet place={selected} onClose={() => setSelected(null)} />
      <BottomNav tab={tab} onChange={go} />
    </div>
  )
}
