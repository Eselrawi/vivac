import { Drawer } from 'vaul'
import { Navigation, Moon, Share2 } from 'lucide-react'
import { KIND_LABEL, type Place } from '../lib/types'

const ACTIONS = [
  { l: 'Cómo llegar', I: Navigation },
  { l: 'Esta noche', I: Moon },
  { l: 'Compartir', I: Share2 },
]

export default function PlaceSheet({ place, onClose }: { place: Place | null; onClose: () => void }) {
  return (
    <Drawer.Root open={!!place} onOpenChange={(o) => !o && onClose()} snapPoints={[0.42, 1]} modal={false}>
      <Drawer.Portal>
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-40 flex h-full max-h-[96%] flex-col rounded-t-3xl shadow-2xl" style={{ background: 'var(--bg)' }}>
          <Drawer.Handle className="mt-2" />
          {place && (
            <div className="p-5">
              <p className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>{KIND_LABEL[place.kind]}</p>
              <Drawer.Title className="font-display text-3xl font-semibold">{place.name}</Drawer.Title>
              <Drawer.Description className="mt-1 text-sm" style={{ color: 'var(--ink-soft)' }}>
                {place.ele ? `${place.ele} m · ` : ''}{place.verified ? 'Verificado' : 'Sin verificar'}
              </Drawer.Description>
              <div className="mt-5 grid grid-cols-3 gap-2">
                {ACTIONS.map(({ l, I }) => (
                  <button key={l} className="tap flex flex-col items-center gap-1 rounded-2xl py-3 text-sm font-semibold" style={{ background: 'var(--surface)' }}>
                    <I size={22} />{l}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
