import { useMemo } from 'react'
import CloseBtn from './CloseBtn'
import { Drawer } from 'vaul'
import { MapPin, Navigation, Star } from 'lucide-react'
import { evaluate, type Ctx } from '../lib/plan'
import { haversine } from '../lib/geo'
import { saveVivac } from '../lib/db'
import { KIND_LABEL, type Place } from '../lib/types'

export interface Pin { lng: number; lat: number; ele: number | null }

export default function WhatsHere({ pin, places, ctx, onClose, onGo }: { pin: Pin | null; places: Place[]; ctx: Ctx; onClose: () => void; onGo: (p: Place) => void }) {
  const near = useMemo(() => {
    if (!pin) return null
    const c = places.filter((p) => p.kind !== 'cumbre' || true).map((p) => ({ p, d: haversine(pin.lat, pin.lng, p.lat, p.lng) })).sort((a, b) => a.d - b.d)[0]
    return c && c.d < 3000 ? c : null
  }, [pin, places])
  const pseudo: Place | null = pin ? { id: 'pin', name: 'Punto marcado', kind: 'candidato', lat: pin.lat, lng: pin.lng, ele: pin.ele ?? undefined, shelter: 'raso', verified: false, source: 'mapa' } : null
  const e = useMemo(() => (pseudo ? evaluate(pseudo, new Date(), ctx) : null), [pin, ctx]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Drawer.Root open={!!pin} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[60] bg-black/30" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 mx-auto max-w-xl z-[70] rounded-t-3xl p-5 pb-8 outline-none" style={{ background: 'var(--bg)' }}>
          <CloseBtn onClick={onClose} />
          <Drawer.Handle />
          <Drawer.Title className="pr-12 font-display mt-3 text-2xl font-semibold">¿Qué hay aquí?</Drawer.Title>
          <Drawer.Description className="flex items-center gap-1 text-sm" style={{ color: 'var(--ink-soft)' }}><MapPin size={14} />{pin?.lat.toFixed(5)}, {pin?.lng.toFixed(5)}</Drawer.Description>
          {pin && (
            <div className="mt-3 flex flex-col gap-2">
              <p className="rounded-2xl p-3" style={{ background: 'var(--surface)' }}>Altitud: <b>{pin.ele != null ? `${Math.round(pin.ele)} m` : 'activa el 3D para medirla'}</b>{near && <><br />Lo más cercano: <b>{near.p.name}</b> ({KIND_LABEL[near.p.kind]}) a {near.d < 1000 ? `${Math.round(near.d)} m` : `${(near.d / 1000).toFixed(1)} km`}</>}</p>
              {e && <p className="rounded-2xl p-3 font-display text-lg leading-snug" style={{ background: 'var(--surface)' }}>Esta noche aquí, al raso: {e.text}</p>}
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => pseudo && (onClose(), onGo(pseudo))} className="tap flex items-center justify-center gap-2 rounded-2xl py-3 font-bold text-white" style={{ background: 'var(--accent)' }}><Navigation size={18} />Ir allí</button>
                <button onClick={async () => { await saveVivac({ name: near && near.d < 150 ? near.p.name : 'Punto marcado', kind: 'deseo', lat: pin.lat, lng: pin.lng, ele: pin.ele }); onClose() }} className="tap flex items-center justify-center gap-2 rounded-2xl py-3 font-bold" style={{ background: 'var(--surface)' }}><Star size={18} />A mi lista de deseos</button>
              </div>
            </div>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
