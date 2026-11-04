import { useCallback, useState } from 'react'
import BottomNav, { type Tab } from './components/BottomNav'
import Fab from './components/Fab'
import PlaceSheet from './components/PlaceSheet'
import Dormir from './tabs/Dormir'
import Mapa from './tabs/Mapa'
import { Diario, Mochila } from './tabs/Simple'
import { SEED } from './data/seed'
import type { Place } from './lib/types'

export default function App() {
  const [tab, setTab] = useState<Tab>('dormir')
  const [selected, setSelected] = useState<Place | null>(null)

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
        {tab === 'dormir' && <Dormir places={SEED} onOpen={open} />}
        {tab === 'diario' && <Diario />}
        {tab === 'mochila' && <Mochila />}
      </main>
      <div className="absolute inset-0" style={{ visibility: tab === 'mapa' ? 'visible' : 'hidden' }}>
        <Mapa places={SEED} selectedId={selected?.id ?? null} onSelect={setSelected} />
      </div>
      {(tab === 'dormir' || tab === 'mapa') && <Fab />}
      <PlaceSheet place={selected} onClose={() => setSelected(null)} />
      <BottomNav tab={tab} onChange={go} />
    </div>
  )
}
