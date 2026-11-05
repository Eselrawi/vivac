import { lazy, Suspense, useEffect, useState } from 'react'
import { Crosshair, Check, X } from 'lucide-react'
import { elevationAt } from '../lib/dem'
import { inSierra } from '../lib/coords'

const MapView = lazy(() => import('./MapView'))

export interface Picked { lat: number; lng: number; ele: number | null }

/** Elegir un punto arrastrando el mapa bajo una mira fija. */
export default function PickOnMap({ start, onPick, onCancel }: { start: { lat: number; lng: number } | null; onPick: (p: Picked) => void; onCancel: () => void }) {
  const [c, setC] = useState<{ lat: number; lng: number }>(start ?? { lat: 40.82, lng: -3.96 })
  const [ele, setEle] = useState<number | null>(null)
  const [zoom, setZoom] = useState(start ? 15 : 11)
  const [layer, setLayer] = useState<'vec' | 'mtn' | 'pnoa'>('mtn')

  useEffect(() => {
    let alive = true
    const t = setTimeout(() => elevationAt(c.lat, c.lng).then((v) => alive && setEle(v)), 250)
    return () => { alive = false; clearTimeout(t) }
  }, [c.lat, c.lng])

  return (
    <div className="fixed inset-0 z-[95] flex flex-col" style={{ background: 'var(--bg)' }} role="dialog" aria-label="Elegir un punto en el mapa">
      <div className="relative min-h-0 flex-1">
        <Suspense fallback={<div className="grid h-full place-items-center">Cargando mapa…</div>}>
          <MapView places={[]} onSelect={() => {}} is3D={false} layer={layer} initialCenter={[c.lng, c.lat]} initialZoom={zoom} onMoveEnd={(lng, lat, z) => { setC({ lat, lng }); setZoom(z) }} controls={false} />
        </Suspense>
        {/* Mira fija en el centro */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" aria-hidden>
          <Crosshair size={44} strokeWidth={1.6} color="#d1553f" style={{ filter: 'drop-shadow(0 1px 2px rgba(255,255,255,.9))' }} />
        </div>
        <button onClick={onCancel} aria-label="Cancelar" className="tap absolute left-3 grid h-12 w-12 place-items-center rounded-full shadow-lg" style={{ top: 'calc(var(--safe-t) + 12px)', background: 'var(--surface)' }}><X size={22} /></button>
        <div className="absolute right-3 flex flex-col gap-2" style={{ top: 'calc(var(--safe-t) + 12px)' }}>
          {([['vec', 'Mapa'], ['mtn', 'Topo'], ['pnoa', 'Satélite']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setLayer(k)} aria-pressed={layer === k} className="tap rounded-full px-4 text-sm font-bold shadow-lg" style={{ background: layer === k ? 'var(--accent)' : 'var(--surface)', color: layer === k ? '#fff' : 'var(--ink)' }}>{l}</button>
          ))}
        </div>
      </div>
      <div className="p-4" style={{ paddingBottom: 'calc(var(--safe-b) + 16px)' }}>
        <p className="text-sm font-semibold">Arrastra el mapa hasta poner la mira sobre el sitio.</p>
        <p className="mt-1 text-sm" style={{ color: 'var(--ink-soft)' }}>
          {c.lat.toFixed(5)}, {c.lng.toFixed(5)} · {ele != null ? `${ele} m` : 'altitud…'}{!inSierra(c) && ' · ⚠️ queda fuera de la sierra'}
        </p>
        <button onClick={() => onPick({ ...c, ele })} className="tap mt-3 flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-lg font-bold text-white" style={{ background: 'var(--accent)' }}><Check size={22} />Usar este punto</button>
      </div>
    </div>
  )
}
