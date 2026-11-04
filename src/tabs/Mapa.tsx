import { useState } from 'react'
import { Layers, Mountain, Siren } from 'lucide-react'
import MapView, { type BaseLayer } from '../components/MapView'
import type { Place } from '../lib/types'

const NEXT: Record<BaseLayer, BaseLayer> = { ign: 'mtn', mtn: 'pnoa', pnoa: 'ign' }
const NAME: Record<BaseLayer, string> = { ign: 'Mapa', mtn: 'Topográfico', pnoa: 'Satélite' }

export default function Mapa({ places, selectedId, onSelect }: { places: Place[]; selectedId: string | null; onSelect: (p: Place) => void }) {
  const [is3D, setIs3D] = useState(true)
  const [layer, setLayer] = useState<BaseLayer>('ign')
  const btn = 'tap grid h-12 w-12 place-items-center rounded-full shadow-lg'
  return (
    <div className="absolute inset-0">
      <MapView places={places} selectedId={selectedId} onSelect={onSelect} is3D={is3D} layer={layer} />
      <div className="absolute right-3 flex flex-col gap-2" style={{ top: 'calc(var(--safe-t) + 12px)' }}>
        <button className={btn} style={{ background: 'var(--surface)' }} aria-label={`Capa: ${NAME[layer]}`} onClick={() => setLayer(NEXT[layer])}><Layers size={22} /></button>
        <button className={btn} style={{ background: is3D ? 'var(--accent)' : 'var(--surface)', color: is3D ? '#fff' : 'var(--ink)' }} aria-label="3D" onClick={() => setIs3D(!is3D)}><Mountain size={22} /></button>
        <button className={btn} style={{ background: '#d1553f', color: '#fff' }} aria-label="SOS 112"><Siren size={22} /></button>
      </div>
    </div>
  )
}
