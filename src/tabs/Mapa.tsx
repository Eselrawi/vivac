import { useEffect, useMemo, useState } from 'react'
import { Drawer } from 'vaul'
import { Copy, Info, Layers, Mountain, Phone, Search, Siren, X } from 'lucide-react'
import MapView, { type BaseLayer } from '../components/MapView'
import { usePrefs } from '../lib/prefs'
import { KIND_COLOR, KIND_LABEL, SLEEP_KINDS, type Place } from '../lib/types'

const NEXT: Record<BaseLayer, BaseLayer> = { ign: 'mtn', mtn: 'pnoa', pnoa: 'ign' }
const NAME: Record<BaseLayer, string> = { ign: 'Mapa', mtn: 'Topográfico', pnoa: 'Satélite' }
type Mode = 'todo' | 'dormir' | 'dormimos'
const MODES: { id: Mode; label: string }[] = [
  { id: 'todo', label: 'Todo' },
  { id: 'dormir', label: 'Para dormir' },
  { id: 'dormimos', label: 'Donde hemos dormido' },
]
const LEGEND: (keyof typeof KIND_COLOR)[] = ['vivac', 'refugio_libre', 'refugio_pago', 'parapeto', 'abrigo', 'fuente', 'deseo', 'parking']

function SOS({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [pos, setPos] = useState<GeolocationCoordinates | null>(null)
  const [err, setErr] = useState(false)
  const [copied, setCopied] = useState(false)
  const { contacts } = usePrefs()
  useEffect(() => {
    if (!open) return
    setErr(false); setCopied(false)
    const id = navigator.geolocation.watchPosition((p) => setPos(p.coords), () => setErr(true), { enableHighAccuracy: true, timeout: 20000 })
    return () => navigator.geolocation.clearWatch(id)
  }, [open])
  const txt = pos ? `${pos.latitude.toFixed(5)}, ${pos.longitude.toFixed(5)}${pos.altitude ? ` · ${Math.round(pos.altitude)} m` : ''}` : ''
  return (
    <Drawer.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[60] bg-black/50" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-[70] rounded-t-3xl p-5 pb-8 outline-none" style={{ background: 'var(--bg)' }}>
          <Drawer.Handle />
          <Drawer.Title className="font-display mt-3 text-2xl font-semibold">Emergencia</Drawer.Title>
          <Drawer.Description className="text-sm" style={{ color: 'var(--ink-soft)' }}>Llama al 112 y dicta estas coordenadas. Funciona sin cobertura de datos.</Drawer.Description>
          <div className="mt-4 rounded-3xl p-5 text-center" style={{ background: 'var(--surface)' }}>
            <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>Tu posición ahora</p>
            <p className="font-display mt-1 text-2xl font-bold" style={{ userSelect: 'text' }}>{txt || (err ? 'Activa la ubicación' : 'Buscando GPS…')}</p>
            {pos && <p className="mt-1 text-xs" style={{ color: 'var(--ink-soft)' }}>Precisión ±{Math.round(pos.accuracy)} m</p>}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <a href="tel:112" className="tap flex items-center justify-center gap-2 rounded-2xl py-4 text-lg font-bold text-white" style={{ background: '#d1553f' }}><Phone size={22} />Llamar al 112</a>
            <button disabled={!pos} onClick={async () => { await navigator.clipboard?.writeText(txt); setCopied(true) }} className="tap flex items-center justify-center gap-2 rounded-2xl py-4 text-lg font-bold disabled:opacity-40" style={{ background: 'var(--surface)' }}><Copy size={20} />{copied ? 'Copiado' : 'Copiar'}</button>
          </div>
          {contacts.length > 0 && (
            <div className="mt-4 flex flex-col gap-2">
              <p className="text-sm font-semibold">Tus contactos</p>
              {contacts.map((c) => <a key={c.phone} href={`tel:${c.phone}`} className="tap flex items-center justify-between rounded-2xl px-4 font-semibold" style={{ background: 'var(--surface)' }}><span>{c.name}</span><span>{c.phone}</span></a>)}
            </div>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

export default function Mapa({ places, selectedId, onSelect }: { places: Place[]; selectedId: string | null; onSelect: (p: Place) => void }) {
  const [is3D, setIs3D] = useState(true)
  const [layer, setLayer] = useState<BaseLayer>('ign')
  const [mode, setMode] = useState<Mode>('todo')
  const [legend, setLegend] = useState(false)
  const [sos, setSos] = useState(false)
  const [q, setQ] = useState('')
  const [focusId, setFocusId] = useState<string | null>(null)

  const shown = useMemo(() => {
    if (mode === 'dormimos') return places.filter((p) => p.kind === 'vivac')
    if (mode === 'dormir') return places.filter((p) => SLEEP_KINDS.includes(p.kind) && !p.toponym)
    return places
  }, [places, mode])
  const sleepN = useMemo(() => places.filter((p) => SLEEP_KINDS.includes(p.kind) && p.kind !== 'vivac' && !p.toponym), [places])
  const visited = sleepN.filter((p) => p.visited).length
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s.length < 2 ? [] : places.filter((p) => p.name.toLowerCase().includes(s)).slice(0, 8)
  }, [q, places])

  const btn = 'tap grid h-12 w-12 place-items-center rounded-full shadow-lg'
  return (
    <div className="absolute inset-0">
      <MapView places={shown} selectedId={focusId ?? selectedId} onSelect={onSelect} is3D={is3D} layer={layer} />

      <div className="absolute inset-x-0 flex flex-col items-center gap-2 px-16" style={{ top: 'calc(var(--safe-t) + 10px)' }}>
        <div className="flex w-full max-w-md items-center gap-2 rounded-full px-4 shadow-lg" style={{ background: 'var(--surface)', minHeight: 48 }}>
          <Search size={18} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar refugio, cumbre, fuente…" aria-label="Buscar" className="min-w-0 flex-1 bg-transparent py-3 outline-none" style={{ userSelect: 'text' }} />
          {q && <button aria-label="Borrar" onClick={() => setQ('')}><X size={18} /></button>}
        </div>
        {hits.length > 0 && (
          <ul className="w-full max-w-md overflow-hidden rounded-2xl shadow-xl" style={{ background: 'var(--surface)' }}>
            {hits.map((h) => (
              <li key={h.id}><button className="tap flex w-full items-center justify-between gap-2 px-4 py-2 text-left" onClick={() => { setFocusId(h.id); onSelect(h); setQ('') }}><span className="truncate font-semibold">{h.name}</span><span className="shrink-0 text-xs" style={{ color: 'var(--ink-soft)' }}>{KIND_LABEL[h.kind]}</span></button></li>
            ))}
          </ul>
        )}
      </div>

      <div className="absolute inset-x-0 flex justify-center px-3" style={{ top: 'calc(var(--safe-t) + 66px)' }}>
        <div className="no-scrollbar flex max-w-full gap-1 overflow-x-auto rounded-full p-1 shadow-lg" role="group" aria-label="Qué mostrar" style={{ background: 'var(--surface)' }}>
          {MODES.map((m) => (
            <button key={m.id} aria-pressed={mode === m.id} onClick={() => setMode(m.id)} className="tap shrink-0 rounded-full px-4 text-sm font-bold" style={{ minHeight: 42, background: mode === m.id ? 'var(--accent)' : 'transparent', color: mode === m.id ? '#fff' : 'var(--ink)' }}>{m.label}</button>
          ))}
        </div>
      </div>

      <div className="absolute right-3 flex flex-col gap-2" style={{ top: 'calc(var(--safe-t) + 124px)' }}>
        <button className={btn} style={{ background: 'var(--surface)' }} aria-label={`Capa: ${NAME[layer]}`} onClick={() => setLayer(NEXT[layer])}><Layers size={22} /></button>
        <button className={btn} style={{ background: is3D ? 'var(--accent)' : 'var(--surface)', color: is3D ? '#fff' : 'var(--ink)' }} aria-label="3D" aria-pressed={is3D} onClick={() => setIs3D(!is3D)}><Mountain size={22} /></button>
        <button className={btn} style={{ background: '#d1553f', color: '#fff' }} aria-label="SOS 112" onClick={() => setSos(true)}><Siren size={22} /></button>
      </div>

      <div className="absolute left-3 flex flex-col items-start gap-2" style={{ bottom: 'calc(72px + var(--safe-b))' }}>
        {legend && (
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-2xl p-3 text-xs font-semibold shadow-xl" style={{ background: 'var(--surface)' }}>
            {LEGEND.map((k) => <li key={k} className="flex items-center gap-2"><i className="inline-block h-3 w-3 rounded-full" style={{ background: KIND_COLOR[k] }} />{KIND_LABEL[k]}</li>)}
            <li className="col-span-2 flex items-center gap-2"><i className="inline-block h-3 w-3 rounded-full border-2" style={{ borderColor: '#ffd9a0', background: '#999' }} />Con borde dorado: ya dormimos ahí</li>
          </ul>
        )}
        <button onClick={() => setLegend(!legend)} className="tap flex items-center gap-2 rounded-full px-4 text-sm font-bold shadow-lg" style={{ background: 'var(--surface)' }}>
          <Info size={16} />{sleepN.length} sitios para dormir · {visited} ya visitados
        </button>
      </div>
      <SOS open={sos} onClose={() => setSos(false)} />
    </div>
  )
}
