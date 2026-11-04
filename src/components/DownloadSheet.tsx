import { useEffect, useMemo, useRef, useState } from 'react'
import { Drawer } from 'vaul'
import { CheckCircle2, Download, Trash2 } from 'lucide-react'
import { cacheStats, clearTiles, downloadTiles, estimateMB, LAYERS, SIERRA, tilesFor, type Bounds, type LayerId } from '../lib/offline'

export default function DownloadSheet({ open, onClose, view }: { open: boolean; onClose: () => void; view: Bounds | null }) {
  const [area, setArea] = useState<'sierra' | 'vista'>('sierra')
  const [detail, setDetail] = useState<14 | 15>(14)
  const [layers, setLayers] = useState<LayerId[]>(['ign', 'dem'])
  const [prog, setProg] = useState<{ done: number; total: number } | null>(null)
  const [result, setResult] = useState<string>('')
  const [stats, setStats] = useState<{ tiles: number; usageMB: number; quotaMB: number } | null>(null)
  const ctl = useRef<AbortController | null>(null)

  useEffect(() => { if (open) cacheStats().then(setStats) }, [open, prog === null])
  const b = area === 'vista' && view ? view : SIERRA
  const list = useMemo(() => tilesFor(b, layers, 8, detail), [b, layers, detail])
  const mb = estimateMB(list)
  const toggle = (l: LayerId) => setLayers(layers.includes(l) ? layers.filter((x) => x !== l) : [...layers, l])

  const go = async () => {
    ctl.current = new AbortController()
    setResult(''); setProg({ done: 0, total: list.length })
    await navigator.storage?.persist?.()
    const r = await downloadTiles(list, (done, total) => setProg({ done, total }), ctl.current.signal)
    setProg(null)
    setResult(ctl.current.signal.aborted ? 'Descarga cancelada.' : r.failed ? `Listo, pero ${r.failed} teselas fallaron. Vuelve a pulsar para completar.` : '¡Zona descargada! Ya puedes usar el mapa sin cobertura.')
  }

  const chip = (on: boolean) => ({ background: on ? 'var(--accent)' : 'var(--surface)', color: on ? '#fff' : 'var(--ink)' })
  return (
    <Drawer.Root open={open} onOpenChange={(o) => !o && !prog && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[60] bg-black/40" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 mx-auto max-w-xl z-[70] max-h-[92%] overflow-y-auto rounded-t-3xl p-5 pb-8 outline-none" style={{ background: 'var(--bg)' }}>
          <Drawer.Handle />
          <Drawer.Title className="font-display mt-3 text-2xl font-semibold">Mapas sin conexión</Drawer.Title>
          <Drawer.Description className="text-sm" style={{ color: 'var(--ink-soft)' }}>Descárgalos con wifi antes de subir. Las rutas y las fichas ya funcionan sin cobertura.</Drawer.Description>

          <p className="mb-1 mt-4 text-sm font-semibold">Zona</p>
          <div className="grid grid-cols-2 gap-2">
            <button className="tap rounded-2xl font-semibold" style={chip(area === 'sierra')} onClick={() => setArea('sierra')}>Toda la sierra</button>
            <button className="tap rounded-2xl font-semibold" style={chip(area === 'vista')} onClick={() => setArea('vista')} disabled={!view}>Lo que veo ahora</button>
          </div>
          <p className="mb-1 mt-4 text-sm font-semibold">Capas</p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(LAYERS) as LayerId[]).map((l) => <button key={l} aria-pressed={layers.includes(l)} onClick={() => toggle(l)} className="tap rounded-full px-4 text-sm font-semibold" style={chip(layers.includes(l))}>{LAYERS[l].label}</button>)}
          </div>
          <p className="mb-1 mt-4 text-sm font-semibold">Detalle</p>
          <div className="grid grid-cols-2 gap-2">
            <button className="tap rounded-2xl text-sm font-semibold" style={chip(detail === 14)} onClick={() => setDetail(14)}>Normal</button>
            <button className="tap rounded-2xl text-sm font-semibold" style={chip(detail === 15)} onClick={() => setDetail(15)}>Máximo (más peso)</button>
          </div>

          <div className="mt-4 rounded-2xl p-4" style={{ background: 'var(--surface)' }}>
            <p className="text-lg font-bold">≈ {mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB <span className="text-sm font-normal" style={{ color: 'var(--ink-soft)' }}>· {list.length.toLocaleString('es-ES')} teselas</span></p>
            {mb > 250 && <p className="mt-1 text-sm" style={{ color: 'var(--color-mal)' }}>Es mucho: usa wifi y comprueba el espacio libre.</p>}
            {stats && <p className="mt-1 text-xs" style={{ color: 'var(--ink-soft)' }}>Ya guardado: {stats.tiles.toLocaleString('es-ES')} teselas · el móvil usa {Math.round(stats.usageMB)} MB de {Math.round(stats.quotaMB).toLocaleString('es-ES')} MB.</p>}
          </div>

          {prog && (
            <div className="mt-4" role="progressbar" aria-valuemin={0} aria-valuemax={prog.total} aria-valuenow={prog.done}>
              <div className="h-3 overflow-hidden rounded-full" style={{ background: 'var(--line)' }}><div className="h-3 rounded-full transition-all" style={{ width: `${(prog.done / prog.total) * 100}%`, background: 'var(--accent)' }} /></div>
              <p className="mt-1 text-sm">{prog.done.toLocaleString('es-ES')} de {prog.total.toLocaleString('es-ES')}</p>
            </div>
          )}
          {result && <p className="mt-3 flex items-center gap-2 text-sm font-semibold"><CheckCircle2 size={18} color="#3f8a68" />{result}</p>}

          <div className="mt-4 grid gap-2" style={{ gridTemplateColumns: '1fr 2fr' }}>
            <button onClick={async () => { await clearTiles(); setResult('Mapas borrados.'); cacheStats().then(setStats) }} disabled={!!prog} className="tap flex items-center justify-center gap-2 rounded-2xl text-sm font-semibold" style={{ background: 'var(--surface)' }}><Trash2 size={16} />Borrar</button>
            {prog ? <button onClick={() => ctl.current?.abort()} className="tap rounded-2xl py-3 font-bold text-white" style={{ background: '#d1553f' }}>Cancelar</button>
              : <button onClick={go} disabled={!layers.length} className="tap flex items-center justify-center gap-2 rounded-2xl py-3 text-lg font-bold text-white disabled:opacity-40" style={{ background: 'var(--accent)' }}><Download size={20} />Descargar</button>}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
