import { useState } from 'react'
import { Drawer } from 'vaul'
import { Plus, Tent, Star, Droplets } from 'lucide-react'

const OPTIONS = [
  { id: 'aqui', label: 'Dormimos aquí', sub: 'Guarda este sitio con GPS y foto', Icon: Tent, color: '#1b2c44' },
  { id: 'ir', label: 'Quiero ir aquí', sub: 'A la lista de deseos', Icon: Star, color: '#d1553f' },
  { id: 'refugio', label: 'Refugio / fuente', sub: 'Un parapeto, refugio o fuente nuevo', Icon: Droplets, color: '#3a86c8' },
]

export default function Fab() {
  const [open, setOpen] = useState(false)
  return (
    <Drawer.Root open={open} onOpenChange={setOpen}>
      <Drawer.Trigger asChild>
        <button
          aria-label="Añadir"
          className="tap fixed right-4 z-20 grid h-14 w-14 place-items-center rounded-full text-white shadow-xl active:scale-95"
          style={{ bottom: 'calc(76px + var(--safe-b))', background: 'var(--accent)', color: '#fff' }}
        >
          <Plus size={30} />
        </button>
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl p-4 pb-8" style={{ background: 'var(--bg)' }}>
          <Drawer.Handle />
          <Drawer.Title className="font-display mb-3 mt-3 text-2xl font-semibold">¿Qué quieres añadir?</Drawer.Title>
          <Drawer.Description className="sr-only">Elige una opción</Drawer.Description>
          <div className="flex flex-col gap-3">
            {OPTIONS.map(({ id, label, sub, Icon, color }) => (
              <button key={id} onClick={() => setOpen(false)} className="tap flex items-center gap-4 rounded-2xl p-4 text-left shadow-sm active:scale-[0.99]" style={{ background: 'var(--surface)' }}>
                <span className="grid h-12 w-12 place-items-center rounded-xl text-white" style={{ background: color }}><Icon size={26} /></span>
                <span><span className="block text-lg font-bold">{label}</span><span className="text-sm" style={{ color: 'var(--ink-soft)' }}>{sub}</span></span>
              </button>
            ))}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
