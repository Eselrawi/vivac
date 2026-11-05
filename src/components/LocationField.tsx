import { useEffect, useState } from 'react'
import { Camera, Link2, MapPin, Map as MapIcon } from 'lucide-react'
import { gps as exifGps } from 'exifr'
import { elevationAt } from '../lib/dem'
import { inSierra, parseCoords } from '../lib/coords'

export interface Pos { lat: number; lng: number; ele: number | null; src: 'gps' | 'mapa' | 'texto' | 'foto' }
type Mode = 'gps' | 'mapa' | 'pegar'

/** Tres maneras de poner el sitio: estoy aquí (GPS), elegirlo en el mapa o pegar coordenadas o un enlace. La altitud sale del modelo de elevación y se puede corregir. */
export default function LocationField({ pos, setPos, gpsErr, onGps, onRequestMap }: { pos: Pos | null; setPos: (p: Pos | null) => void; gpsErr?: boolean; onGps: () => void; onRequestMap: () => void }) {
  const [mode, setMode] = useState<Mode>('gps')
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const [eleTxt, setEleTxt] = useState('')

  useEffect(() => { setEleTxt(pos?.ele != null ? String(Math.round(pos.ele)) : '') }, [pos?.lat, pos?.lng, pos?.ele])

  const fromCoords = async (lat: number, lng: number, src: Pos['src']) => {
    setPos({ lat, lng, ele: null, src })
    const e = await elevationAt(lat, lng)
    setPos({ lat, lng, ele: e, src })
  }
  const read = async () => {
    const c = parseCoords(text)
    if (!c) { setErr('No encuentro unas coordenadas ahí. Prueba con «40.8232, -3.9624» o un enlace de Google Maps.'); return }
    setErr('')
    await fromCoords(c.lat, c.lng, 'texto')
  }
  const fromPhoto = async (f: File) => {
    const g = await exifGps(f).catch(() => null)
    if (!g) { setErr('Esa foto no trae ubicación.'); return }
    setErr('')
    await fromCoords(g.latitude, g.longitude, 'foto')
  }

  const seg = (m: Mode, I: typeof MapPin, label: string) => (
    <button key={m} aria-pressed={mode === m} onClick={() => { setMode(m); if (m === 'gps') onGps(); if (m === 'mapa') onRequestMap() }} className="tap flex flex-col items-center gap-1 rounded-2xl px-1 py-2 text-xs font-bold" style={{ background: mode === m ? 'var(--accent)' : 'var(--surface)', color: mode === m ? '#fff' : 'var(--ink)' }}>
      <I size={20} />{label}
    </button>
  )

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Cómo poner el sitio">
        {seg('gps', MapPin, 'Estoy aquí')}
        {seg('mapa', MapIcon, 'Elegir en el mapa')}
        {seg('pegar', Link2, 'Pegar coordenadas')}
      </div>

      {mode === 'pegar' && (
        <div className="rounded-2xl p-3" style={{ background: 'var(--surface)' }}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="40.8232, -3.9624 · o pega un enlace de Google Maps u OpenStreetMap" className="w-full rounded-xl border p-2 text-sm" style={{ background: 'var(--bg)', borderColor: 'var(--line)', userSelect: 'text' }} />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button onClick={read} disabled={!text.trim()} className="tap rounded-xl text-sm font-bold text-white disabled:opacity-40" style={{ background: 'var(--accent)' }}>Leer</button>
            <label className="tap flex cursor-pointer items-center justify-center gap-1 rounded-xl text-sm font-bold" style={{ background: 'var(--bg)' }}>
              <Camera size={16} />Ubicación de una foto
              <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void fromPhoto(f); e.target.value = '' }} />
            </label>
          </div>
        </div>
      )}
      {mode === 'mapa' && !pos && <button onClick={onRequestMap} className="tap rounded-2xl py-3 font-semibold" style={{ background: 'var(--surface)' }}>Abrir el mapa</button>}
      {err && <p className="text-sm" style={{ color: 'var(--color-mal)' }}>{err}</p>}

      <div className="flex items-center gap-3 rounded-2xl p-3" style={{ background: 'var(--surface)' }}>
        <MapPin size={20} className="shrink-0" />
        <div className="min-w-0 flex-1 text-sm">
          {pos ? <><b>{pos.lat.toFixed(5)}, {pos.lng.toFixed(5)}</b><span className="ml-1" style={{ color: 'var(--ink-soft)' }}>({{ gps: 'GPS', mapa: 'elegido en el mapa', texto: 'coordenadas pegadas', foto: 'ubicación de la foto' }[pos.src]})</span>{!inSierra(pos) && <span className="block text-xs" style={{ color: 'var(--color-mal)' }}>⚠️ Queda fuera de la sierra: revísalo.</span>}</> : gpsErr ? 'Sin GPS: activa la ubicación o elige otra opción' : 'Buscando GPS…'}
        </div>
        <label className="flex shrink-0 items-center gap-1 text-sm">
          <input aria-label="Altitud en metros" inputMode="numeric" value={eleTxt} placeholder="m" onChange={(e) => { setEleTxt(e.target.value); const v = parseInt(e.target.value, 10); if (pos) setPos({ ...pos, ele: Number.isFinite(v) ? v : null }) }} className="w-16 rounded-lg border px-2 py-1.5 text-right" style={{ background: 'var(--bg)', borderColor: 'var(--line)', userSelect: 'text' }} />m
        </label>
      </div>
      {pos && pos.src !== 'gps' && <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>La altitud sale del modelo de elevación; puedes corregirla a mano.</p>}

    </div>
  )
}
