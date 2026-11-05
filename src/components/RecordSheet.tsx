import { useEffect, useState } from 'react'
import { Drawer } from 'vaul'
import { Camera, Check, MapPin } from 'lucide-react'
import { compressPhoto, saveVivac } from '../lib/db'
import { gps as exifGps } from 'exifr'
import { haversine } from '../lib/geo'
import type { Place } from '../lib/types'

type Mode = 'vivac' | 'deseo'
const SLEEP = [{ v: 1, e: '🥶', l: 'Frío' }, { v: 2, e: '😴', l: 'Bien' }, { v: 3, e: '🥵', l: 'Calor' }] as const

export default function RecordSheet({ mode, onClose, places }: { mode: Mode | null; onClose: () => void; places: Place[] }) {
  const [name, setName] = useState('')
  const [pos, setPos] = useState<{ lat: number; lng: number; ele: number | null } | null>(null)
  const [gpsErr, setGpsErr] = useState(false)
  const [photo, setPhoto] = useState<Blob | null>(null)
  const [sleep, setSleep] = useState<1 | 2 | 3 | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!mode) return
    setName(''); setPhoto(null); setSleep(null); setDone(false); setPos(null); setGpsErr(false)
    const id = navigator.geolocation?.getCurrentPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude, ele: p.coords.altitude }),
      () => setGpsErr(true),
      { enableHighAccuracy: true, timeout: 15000 },
    )
    return () => void id
  }, [mode])

  // Si estás junto a un sitio conocido, te propongo su nombre.
  useEffect(() => {
    if (!pos || name) return
    const near = places.filter((p) => !p.unnamed && p.kind !== 'parking' && p.kind !== 'cumbre' && p.kind !== 'fuente').map((p) => ({ p, d: haversine(pos.lat, pos.lng, p.lat, p.lng) })).filter((x) => x.d < 250).sort((a, b) => a.d - b.d)[0]
    if (near) setName(near.p.name)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos])

  const save = async () => {
    if (!pos || !name.trim() || !mode) return
    await saveVivac({ name: name.trim(), kind: mode, lat: pos.lat, lng: pos.lng, ele: pos.ele, photo, sleep })
    setDone(true)
    setTimeout(onClose, 1100)
  }

  return (
    <Drawer.Root open={!!mode} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[60] bg-black/40" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 mx-auto max-w-xl z-[70] rounded-t-3xl max-h-[92dvh] flex flex-col" style={{ background: 'var(--bg)' }}>
          <div className="px-5 pt-5"><Drawer.Handle /></div>
          <div data-vaul-no-drag className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-10">
          <Drawer.Title className="font-display mt-3 text-2xl font-semibold">{mode === 'deseo' ? 'Quiero ir aquí' : 'Dormimos aquí'}</Drawer.Title>
          <Drawer.Description className="sr-only">Guardar un sitio</Drawer.Description>
          {done ? (
            <div className="grid place-items-center py-10">
              <div className="grid h-20 w-20 animate-bounce place-items-center rounded-full text-white" style={{ background: 'var(--accent)' }}><Check size={44} /></div>
              <p className="font-display mt-4 text-xl font-semibold">¡Guardado!</p>
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-4">
              <p className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink-soft)' }}>
                <MapPin size={18} />
                {pos ? `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}${pos.ele ? ` · ${Math.round(pos.ele)} m` : ''}` : gpsErr ? 'Sin GPS: activa la ubicación' : 'Buscando GPS…'}
              </p>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nombre del sitio"
                className="tap w-full rounded-2xl border px-4 text-lg"
                style={{ background: 'var(--surface)', borderColor: 'var(--line)', userSelect: 'text' }}
              />
              <label className="tap flex cursor-pointer items-center justify-center gap-2 rounded-2xl py-3 font-semibold" style={{ background: 'var(--surface)' }}>
                <Camera size={22} /> {photo ? 'Foto lista ✓' : 'Hacer foto'}
                <input type="file" accept="image/*" capture="environment" hidden onChange={async (e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  // Si la foto trae ubicación (EXIF) y aún no hay GPS, la usamos.
                  const g = await exifGps(f).catch(() => null)
                  if (g && !pos) setPos({ lat: g.latitude, lng: g.longitude, ele: null })
                  setPhoto(await compressPhoto(f))
                }} />
              </label>
              {mode === 'vivac' && (
                <div className="grid grid-cols-3 gap-2">
                  {SLEEP.map((s) => (
                    <button key={s.v} onClick={() => setSleep(s.v)} className="tap rounded-2xl py-2 text-sm font-semibold" style={{ background: sleep === s.v ? 'var(--accent)' : 'var(--surface)', color: sleep === s.v ? '#fff' : 'var(--ink)' }}>
                      <span className="block text-2xl">{s.e}</span>{s.l}
                    </button>
                  ))}
                </div>
              )}
              <button onClick={save} disabled={!pos || !name.trim()} className="tap rounded-2xl py-4 text-lg font-bold text-white disabled:opacity-40" style={{ background: 'var(--accent)' }}>
                Guardar
              </button>
            </div>
          )}
        </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
