import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Drawer } from 'vaul'
import { Camera, Check, Search, X } from 'lucide-react'
import CloseBtn from './CloseBtn'
import LocationField, { type Pos } from './LocationField'
import { compressPhoto, saveVivac } from '../lib/db'
import { haversine } from '../lib/geo'
import { KIND_LABEL, SLEEP_KINDS, type Place } from '../lib/types'

const PickOnMap = lazy(() => import('./PickOnMap'))

type Mode = 'vivac' | 'deseo'
const SLEEP = [{ v: 1, e: '🥶', l: 'Frío' }, { v: 2, e: '😴', l: 'Bien' }, { v: 3, e: '🥵', l: 'Calor' }] as const
const today = () => new Date().toLocaleDateString('sv-SE')

export default function RecordSheet({ mode, onClose, places }: { mode: Mode | null; onClose: () => void; places: Place[] }) {
  const [name, setName] = useState('')
  const [pos, setPos] = useState<Pos | null>(null)
  const [gpsErr, setGpsErr] = useState(false)
  const [photo, setPhoto] = useState<Blob | null>(null)
  const [sleep, setSleep] = useState<1 | 2 | 3 | null>(null)
  const [done, setDone] = useState(false)
  const [date, setDate] = useState(today())
  const [linked, setLinked] = useState<Place | null>(null)
  const [q, setQ] = useState('')
  const [picking, setPicking] = useState(false)

  const askGps = () => {
    setGpsErr(false)
    navigator.geolocation?.getCurrentPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude, ele: p.coords.altitude != null ? Math.round(p.coords.altitude) : null, src: 'gps' }),
      () => setGpsErr(true),
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }

  useEffect(() => {
    if (!mode) return
    setName(''); setPhoto(null); setSleep(null); setDone(false); setPos(null); setDate(today()); setLinked(null); setQ(''); setPicking(false)
    askGps()
  }, [mode])

  // Si estás junto a un sitio conocido, te propongo su nombre.
  useEffect(() => {
    if (!pos || name || linked) return
    const near = places.filter((p) => !p.unnamed && p.kind !== 'parking' && p.kind !== 'cumbre' && p.kind !== 'fuente').map((p) => ({ p, d: haversine(pos.lat, pos.lng, p.lat, p.lng) })).filter((x) => x.d < 250).sort((a, b) => a.d - b.d)[0]
    if (near) setName(near.p.name)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos])

  const hits = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s.length < 2 ? [] : places.filter((p) => (SLEEP_KINDS.includes(p.kind) && p.kind !== 'vivac') && p.name.toLowerCase().includes(s)).slice(0, 5)
  }, [q, places])

  const link = (p: Place) => { setLinked(p); setName(p.name); setPos({ lat: p.lat, lng: p.lng, ele: p.ele ?? null, src: 'mapa' }); setQ('') }

  const save = async () => {
    if (!pos || !name.trim() || !mode) return
    // Una noche pasada se guarda a las 23:00 de ese día, para pedir luego el tiempo real de esa noche.
    const at = date === today() ? undefined : new Date(`${date}T23:00:00`).getTime()
    await saveVivac({ name: name.trim(), kind: mode, lat: pos.lat, lng: pos.lng, ele: pos.ele, photo, sleep, placeId: linked?.id }, at)
    setDone(true)
    setTimeout(onClose, 1100)
  }

  return (
    <>
      <Drawer.Root open={!!mode && !picking} onOpenChange={(o) => !o && onClose()}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-[60] bg-black/40" />
          <Drawer.Content className="fixed inset-x-0 bottom-0 mx-auto max-w-xl z-[70] rounded-t-3xl outline-none max-h-[92dvh] flex flex-col" style={{ background: 'var(--bg)' }}>
            <CloseBtn onClick={onClose} />
            <div className="px-5 pt-5"><Drawer.Handle /></div>
            <div data-vaul-no-drag className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-10">
              <Drawer.Title className="pr-12 font-display mt-3 text-2xl font-semibold">{mode === 'deseo' ? 'Quiero ir aquí' : 'Dormimos aquí'}</Drawer.Title>
              <Drawer.Description className="sr-only">Guardar un sitio</Drawer.Description>
              {done ? (
                <div className="grid place-items-center py-10">
                  <div className="grid h-20 w-20 animate-bounce place-items-center rounded-full text-white" style={{ background: 'var(--accent)' }}><Check size={44} /></div>
                  <p className="font-display mt-4 text-xl font-semibold">¡Guardado!</p>
                </div>
              ) : (
                <div className="mt-4 flex flex-col gap-4">
                  <LocationField pos={pos} setPos={setPos} gpsErr={gpsErr} onGps={askGps} onRequestMap={() => setPicking(true)} />

                  {mode === 'vivac' && (
                    <div>
                      <p className="mb-1 text-sm font-semibold">¿Es un sitio que ya está en la app?</p>
                      {linked ? (
                        <div className="flex items-center justify-between gap-2 rounded-2xl p-3 text-sm" style={{ background: 'var(--surface)' }}>
                          <span><b>{linked.name}</b> · {KIND_LABEL[linked.kind]}</span>
                          <button aria-label="Quitar el enlace" className="tap grid h-10 w-10 place-items-center" onClick={() => setLinked(null)}><X size={18} /></button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 rounded-2xl px-3" style={{ background: 'var(--surface)', minHeight: 48 }}>
                            <Search size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busca el refugio o parapeto…" className="min-w-0 flex-1 bg-transparent py-2 outline-none" style={{ userSelect: 'text' }} />
                          </div>
                          {hits.length > 0 && <ul className="mt-1 overflow-hidden rounded-2xl" style={{ background: 'var(--surface)' }}>{hits.map((h) => <li key={h.id}><button className="tap flex w-full items-center justify-between gap-2 px-4 py-2 text-left" onClick={() => link(h)}><span className="truncate font-semibold">{h.name}</span><span className="shrink-0 text-xs" style={{ color: 'var(--ink-soft)' }}>{KIND_LABEL[h.kind]}</span></button></li>)}</ul>}
                        </>
                      )}
                    </div>
                  )}

                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del sitio" className="tap w-full rounded-2xl border px-4 text-lg" style={{ background: 'var(--surface)', borderColor: 'var(--line)', userSelect: 'text' }} />

                  {mode === 'vivac' && (
                    <label className="block text-sm font-semibold">¿Qué noche fue?
                      <input type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value || today())} className="tap mt-1 w-full rounded-2xl border px-4 text-base" style={{ background: 'var(--surface)', borderColor: 'var(--line)', color: 'var(--ink)', userSelect: 'text' }} />
                      {date !== today() && <span className="mt-1 block text-xs font-normal" style={{ color: 'var(--ink-soft)' }}>Se apunta como noche pasada y, con cobertura, se añadirá el tiempo real que hizo.</span>}
                    </label>
                  )}

                  <label className="tap flex cursor-pointer items-center justify-center gap-2 rounded-2xl py-3 font-semibold" style={{ background: 'var(--surface)' }}>
                    <Camera size={22} /> {photo ? 'Foto lista ✓' : 'Hacer o elegir foto'}
                    <input type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setPhoto(await compressPhoto(f)) }} />
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
                  <button onClick={save} disabled={!pos || !name.trim()} className="tap rounded-2xl py-4 text-lg font-bold text-white disabled:opacity-40" style={{ background: 'var(--accent)' }}>Guardar</button>
                </div>
              )}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
      {picking && (
        <Suspense fallback={null}>
          <PickOnMap start={pos} onCancel={() => setPicking(false)} onPick={(p) => { setPicking(false); setPos({ lat: p.lat, lng: p.lng, ele: p.ele, src: 'mapa' }) }} />
        </Suspense>
      )}
    </>
  )
}
