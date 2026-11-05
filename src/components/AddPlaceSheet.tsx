import { useEffect, useState } from 'react'
import CloseBtn from './CloseBtn'
import { Drawer } from 'vaul'
import { Camera, Check, Compass, MapPin } from 'lucide-react'
import { compressPhoto, saveVivac } from '../lib/db'
import { WindRose } from './ui'

const TYPES = [
  { id: 'refugio_libre', label: 'Refugio o chozo', shelter: 'cerrado', e: '🛖' },
  { id: 'parapeto', label: 'Parapeto de piedra', shelter: 'parapeto', e: '🧱' },
  { id: 'abrigo', label: 'Abrigo bajo roca', shelter: 'techo', e: '🪨' },
  { id: 'fuente', label: 'Fuente', shelter: undefined, e: '💧' },
] as const
const CAP = [1, 2, 4, 6, 10]

/** Rumbo del móvil hacia donde apunta la abertura (brújula del móvil si hay). */
function useCompass(on: boolean) {
  const [deg, setDeg] = useState<number | null>(null)
  useEffect(() => {
    if (!on) return
    const h = (e: DeviceOrientationEvent & { webkitCompassHeading?: number }) => {
      const v = e.webkitCompassHeading ?? (e.alpha != null ? (360 - e.alpha) % 360 : null)
      if (v != null) setDeg(Math.round(v))
    }
    window.addEventListener('deviceorientationabsolute', h as EventListener, true)
    window.addEventListener('deviceorientation', h as EventListener, true)
    return () => { window.removeEventListener('deviceorientationabsolute', h as EventListener, true); window.removeEventListener('deviceorientation', h as EventListener, true) }
  }, [on])
  return deg
}

export default function AddPlaceSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [type, setType] = useState<(typeof TYPES)[number]['id']>('parapeto')
  const [name, setName] = useState('')
  const [pos, setPos] = useState<{ lat: number; lng: number; ele: number | null } | null>(null)
  const [photo, setPhoto] = useState<Blob | null>(null)
  const [cap, setCap] = useState<number | null>(null)
  const [open_, setOpen_] = useState<number[]>([])
  const [useC, setUseC] = useState(false)
  const [done, setDone] = useState(false)
  const heading = useCompass(useC)

  useEffect(() => {
    if (!open) return
    setName(''); setPhoto(null); setCap(null); setOpen_([]); setDone(false); setPos(null); setUseC(false)
    navigator.geolocation?.getCurrentPosition((p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude, ele: p.coords.altitude }), () => {}, { enableHighAccuracy: true, timeout: 15000 })
  }, [open])

  const t = TYPES.find((x) => x.id === type)!
  // La abertura mira hacia `heading`; el muro resguarda de los vientos que vienen del lado contrario.
  const sheltered = (deg: number) => Math.round((((deg + 180) % 360) / 45)) % 8 * 45
  const toggle = (d: number) => setOpen_(open_.includes(d) ? open_.filter((x) => x !== d) : [...open_, d])
  const markFromCompass = () => { if (heading != null) setOpen_((cur) => [...new Set([...cur, sheltered(heading)])]) }

  const save = async () => {
    if (!pos || !name.trim()) return
    await saveVivac({ name: name.trim(), kind: type, lat: pos.lat, lng: pos.lng, ele: pos.ele, photo, shelter: t.shelter, shelteredFrom: type === 'parapeto' ? open_ : undefined, capacity: cap })
    setDone(true)
    setTimeout(onClose, 1100)
  }

  return (
    <Drawer.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[60] bg-black/40" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 mx-auto max-w-xl z-[70] max-h-[92dvh] rounded-t-3xl outline-none flex flex-col" style={{ background: 'var(--bg)' }}>
          <CloseBtn onClick={onClose} />
          <div className="px-5 pt-5"><Drawer.Handle /></div>
          <div data-vaul-no-drag className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-10">
          <Drawer.Title className="pr-12 font-display mt-3 text-2xl font-semibold">Encontré un sitio</Drawer.Title>
          <Drawer.Description className="sr-only">Añadir un refugio, parapeto o fuente</Drawer.Description>
          {done ? (
            <div className="grid place-items-center py-10"><div className="grid h-20 w-20 animate-bounce place-items-center rounded-full text-white" style={{ background: 'var(--accent)' }}><Check size={44} /></div><p className="font-display mt-4 text-xl font-semibold">¡Añadido para el grupo!</p></div>
          ) : (
            <div className="mt-4 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-2">
                {TYPES.map((x) => <button key={x.id} onClick={() => setType(x.id)} aria-pressed={type === x.id} className="tap rounded-2xl py-3 text-sm font-semibold" style={{ background: type === x.id ? 'var(--accent)' : 'var(--surface)', color: type === x.id ? '#fff' : 'var(--ink)' }}><span className="block text-2xl">{x.e}</span>{x.label}</button>)}
              </div>
              <p className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink-soft)' }}><MapPin size={18} />{pos ? `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}${pos.ele ? ` · ${Math.round(pos.ele)} m` : ''}` : 'Buscando GPS…'}</p>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre (p. ej. Parapeto del Peñotillo)" className="tap w-full rounded-2xl border px-4 text-lg" style={{ background: 'var(--surface)', borderColor: 'var(--line)', userSelect: 'text' }} />
              <label className="tap flex cursor-pointer items-center justify-center gap-2 rounded-2xl py-3 font-semibold" style={{ background: 'var(--surface)' }}>
                <Camera size={22} />{photo ? 'Foto lista ✓' : 'Hacer foto'}
                <input type="file" accept="image/*" capture="environment" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setPhoto(await compressPhoto(f)) }} />
              </label>
              {type !== 'fuente' && (
                <div>
                  <p className="mb-1 text-sm font-semibold">¿Cuántos caben?</p>
                  <div className="flex gap-2">{CAP.map((n) => <button key={n} onClick={() => setCap(n)} aria-pressed={cap === n} className="tap flex-1 rounded-2xl font-bold" style={{ background: cap === n ? 'var(--accent)' : 'var(--surface)', color: cap === n ? '#fff' : 'var(--ink)' }}>{n === 10 ? '10+' : n}</button>)}</div>
                </div>
              )}
              {type === 'parapeto' && (
                <div className="rounded-2xl p-3" style={{ background: 'var(--surface)' }}>
                  <p className="text-sm font-semibold">¿De qué vientos os resguarda?</p>
                  <div className="mt-2 flex items-center gap-4">
                    <WindRose sheltered={open_} onToggle={toggle} size={140} />
                    <div className="text-sm" style={{ color: 'var(--ink-soft)' }}>
                      Toca los lados donde hay muro.
                      <button onClick={() => { setUseC(true); markFromCompass() }} className="tap mt-2 flex items-center gap-2 rounded-2xl px-3 font-semibold" style={{ background: 'var(--bg)', color: 'var(--ink)' }}><Compass size={18} />{useC && heading != null ? `Abertura hacia ${heading}° · marcar` : 'Usar la brújula'}</button>
                      <span className="mt-1 block text-xs">Apunta el móvil hacia donde mira la abertura y pulsa.</span>
                    </div>
                  </div>
                </div>
              )}
              <button onClick={save} disabled={!pos || !name.trim()} className="tap rounded-2xl py-4 text-lg font-bold text-white disabled:opacity-40" style={{ background: 'var(--accent)' }}>Guardar</button>
            </div>
          )}
        </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
