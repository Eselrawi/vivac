import { useEffect, useMemo, useRef, useState } from 'react'
import { Drawer } from 'vaul'
import { Award, Download, Share2, Trash2 } from 'lucide-react'
import { db, useLive, type VivacRecord } from '../lib/db'
import { learnMargin } from '../lib/pack'
import { getPrefs, setPrefs } from '../lib/prefs'
import { download, toGpx } from '../lib/gpx'
import { supabase } from '../lib/supabase'
import { nightActual } from '../lib/weather'
import { Illustration } from '../components/ui'
import type { Place } from '../lib/types'

const FACE: Record<number, string> = { 1: '🥶', 2: '😴', 3: '🥵' }
const FACE_TXT: Record<number, string> = { 1: 'Pasamos frío', 2: 'Dormimos bien', 3: 'Calor' }
const fmtDate = (t: number) => new Date(t).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
const t1 = (n: number) => `${Math.round(n)} °C`.replace('-', '−')

function usePhoto(r: VivacRecord): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let revoke: string | null = null
    let alive = true
    if (r.photo) { revoke = URL.createObjectURL(r.photo); setUrl(revoke) }
    else if (r.photoPath && navigator.onLine) {
      supabase.storage.from('photos').createSignedUrl(r.photoPath, 3600).then(({ data }) => alive && setUrl(data?.signedUrl ?? null))
    } else setUrl(null)
    return () => { alive = false; if (revoke) URL.revokeObjectURL(revoke) }
  }, [r.photo, r.photoPath])
  return url
}

function Cover({ r, className = '' }: { r: VivacRecord; className?: string }) {
  const url = usePhoto(r)
  return url ? <img src={url} alt={`Foto de ${r.name}`} className={`object-cover ${className}`} loading="lazy" /> : <Illustration kind="vivac" className={className} />
}

function Heat({ pts, ctx }: { pts: VivacRecord[]; ctx: Place[] }) {
  const c = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = c.current
    if (!cv) return
    const W = (cv.width = 640), H = (cv.height = 360)
    const g = cv.getContext('2d')!
    const [w0, w1, s0, s1] = [-4.45, -3.65, 40.55, 41.05]
    const X = (lng: number) => ((lng - w0) / (w1 - w0)) * W
    const Y = (lat: number) => (1 - (lat - s0) / (s1 - s0)) * H
    g.fillStyle = '#0e1b2c'; g.fillRect(0, 0, W, H)
    g.fillStyle = 'rgba(255,255,255,.18)'
    for (const p of ctx) g.fillRect(X(p.lng), Y(p.lat), 2, 2)
    g.globalCompositeOperation = 'lighter'
    for (const p of pts) {
      const gr = g.createRadialGradient(X(p.lng), Y(p.lat), 0, X(p.lng), Y(p.lat), 46)
      gr.addColorStop(0, 'rgba(242,166,90,.75)'); gr.addColorStop(1, 'rgba(242,166,90,0)')
      g.fillStyle = gr; g.beginPath(); g.arc(X(p.lng), Y(p.lat), 46, 0, 7); g.fill()
    }
  }, [pts, ctx])
  return <canvas ref={c} className="w-full rounded-2xl" role="img" aria-label="Mapa de calor de vuestras noches en la sierra" />
}

function DetailInner({ r, onClose }: { r: VivacRecord; onClose: () => void }) {
  const [notes, setNotes] = useState('')
  const [sure, setSure] = useState(false)
  useEffect(() => { setNotes(r.notes ?? ''); setSure(false) }, [r.id, r.notes])
  const url = usePhoto(r)

  const rate = async (v: 1 | 2 | 3) => {
    const first = !r.sleep
    await db.vivacs.update(r.id, { sleep: v, synced: 0 })
    if (first) setPrefs({ coldMargin: learnMargin(getPrefs().coldMargin, v) })
  }
  const saveNotes = async () => { if (notes !== (r.notes ?? '')) await db.vivacs.update(r.id, { notes, synced: 0 }) }
  const share = async () => {
    const text = `⛺ ${r.name} · ${fmtDate(r.at)}${r.sleep ? `\n${FACE[r.sleep]} ${FACE_TXT[r.sleep]}` : ''}${r.wx ? `\n🌡️ mínima ${t1(r.wx.tmin)}, viento hasta ${Math.round(r.wx.windMax)} km/h` : ''}\n📍 https://www.google.com/maps?q=${r.lat},${r.lng}`
    if (navigator.share) await navigator.share({ title: r.name, text }).catch(() => {})
    else window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }
  const del = async () => {
    if (!sure) return setSure(true)
    await db.vivacs.delete(r.id)
    if (r.synced) await supabase.from('vivacs').delete().eq('id', r.id)
    onClose()
  }
  return (
    <Drawer.Root open onOpenChange={(o) => !o && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[60] bg-black/40" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 mx-auto max-w-xl z-[70] max-h-[94dvh] flex flex-col rounded-t-3xl outline-none" style={{ background: 'var(--bg)' }}>
          <Drawer.Handle className="my-2" />
          <div data-vaul-no-drag className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-8">
          <div className="h-56 overflow-hidden">{url ? <img src={url} alt={`Foto de ${r.name}`} className="h-full w-full object-cover" /> : <Illustration kind="vivac" className="h-full w-full" />}</div>
          <div className="px-5 pt-4">
            <Drawer.Title className="font-display text-3xl font-semibold leading-tight">{r.name}</Drawer.Title>
            <Drawer.Description className="text-sm" style={{ color: 'var(--ink-soft)' }}>{fmtDate(r.at)}{r.ele ? ` · ${Math.round(r.ele)} m` : ''}{!r.synced && ' · pendiente de subir'}</Drawer.Description>
            {r.wx ? (
              <p className="mt-3 rounded-2xl p-3 text-sm" style={{ background: 'var(--surface)' }}>🌡️ Mínima <b>{t1(r.wx.tmin)}</b> · 💨 viento hasta <b>{Math.round(r.wx.windMax)} km/h</b> · 🌧️ {r.wx.precip >= 0.5 ? `${r.wx.precip.toFixed(1)} mm` : 'sin lluvia'} · ☁️ {Math.round(r.wx.cloud)} % nubes <span style={{ color: 'var(--ink-soft)' }}>({r.wx.src === 'real' ? 'datos reales de esa noche' : 'previsión'})</span></p>
            ) : <p className="mt-3 text-sm" style={{ color: 'var(--ink-soft)' }}>El tiempo real de esa noche se añadirá solo cuando haya cobertura.</p>}
            <p className="mb-1 mt-4 font-semibold">¿Qué tal se durmió?</p>
            <div className="grid grid-cols-3 gap-2">
              {([1, 2, 3] as const).map((v) => <button key={v} onClick={() => rate(v)} aria-pressed={r.sleep === v} className="tap rounded-2xl py-2 text-sm font-semibold" style={{ background: r.sleep === v ? 'var(--accent)' : 'var(--surface)', color: r.sleep === v ? '#fff' : 'var(--ink)' }}><span className="block text-2xl">{FACE[v]}</span>{FACE_TXT[v]}</button>)}
            </div>
            <p className="mb-1 mt-4 font-semibold">Notas</p>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes} rows={3} placeholder="Quién vino, qué cenasteis, qué anécdota…" className="w-full rounded-2xl border p-3" style={{ background: 'var(--surface)', borderColor: 'var(--line)', userSelect: 'text' }} />
            <div className="mt-4 grid grid-cols-3 gap-2 text-sm font-semibold">
              <button onClick={share} className="tap flex flex-col items-center gap-1 rounded-2xl py-3" style={{ background: 'var(--surface)' }}><Share2 size={20} />Compartir</button>
              <button onClick={() => download(`${r.name}.gpx`, 'application/gpx+xml', toGpx([r]))} className="tap flex flex-col items-center gap-1 rounded-2xl py-3" style={{ background: 'var(--surface)' }}><Download size={20} />GPX</button>
              <button onClick={del} className="tap flex flex-col items-center gap-1 rounded-2xl py-3" style={{ background: sure ? '#d1553f' : 'var(--surface)', color: sure ? '#fff' : 'var(--ink)' }}><Trash2 size={20} />{sure ? '¿Seguro?' : 'Borrar'}</button>
            </div>
          </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

const Detail = ({ r, onClose }: { r: VivacRecord | null; onClose: () => void }) => (r ? <DetailInner r={r} onClose={onClose} /> : null)

export default function Diario({ places, focusId, onFocused }: { places: Place[]; focusId?: string | null; onFocused?: () => void }) {
  const all = useLive(() => db.vivacs.where('kind').equals('vivac').toArray(), [] as VivacRecord[])
  const recs = useMemo(() => [...all].sort((a, b) => b.at - a.at), [all])
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => { if (focusId) { setOpen(focusId); onFocused?.() } }, [focusId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Tiempo real de cada noche: se rellena solo cuando hay red.
  useEffect(() => {
    const todo = recs.filter((r) => !r.wx && Date.now() - r.at > 14 * 3600000).slice(0, 4)
    if (!todo.length || !navigator.onLine) return
    void (async () => {
      for (const r of todo) {
        const wx = await nightActual(r.lat, r.lng, r.ele, r.at).catch(() => null)
        if (wx) await db.vivacs.update(r.id, { wx, synced: r.synced ? 0 : 0 })
      }
    })()
  }, [recs])

  const year = new Date().getFullYear()
  const thisYear = recs.filter((r) => new Date(r.at).getFullYear() === year)
  const coldest = recs.filter((r) => r.wx).sort((a, b) => a.wx!.tmin - b.wx!.tmin)[0]
  const highest = [...recs].filter((r) => r.ele).sort((a, b) => (b.ele ?? 0) - (a.ele ?? 0))[0]
  const shelters = places.filter((p) => (p.kind === 'refugio_libre' || p.kind === 'refugio_pago' || p.kind === 'parapeto' || p.kind === 'abrigo') && p.visited).length
  const ago = recs.filter((r) => { const d = Math.abs(Date.now() - r.at - 365 * 86400000); return d < 4 * 86400000 })
  const catalogDots = useMemo(() => places.filter((p) => p.kind === 'refugio_libre' || p.kind === 'parapeto'), [places])

  const badges = [
    { id: 'p1', on: recs.length >= 1, t: 'Primera noche', d: 'Ya habéis dormido fuera' },
    { id: 'p5', on: recs.length >= 5, t: '5 noches', d: 'Ya es costumbre' },
    { id: 'p10', on: recs.length >= 10, t: '10 noches', d: 'Veteranos del vivac' },
    { id: 'frio', on: recs.some((r) => r.wx && r.wx.tmin < 0), t: 'Bajo cero', d: 'Una noche por debajo de 0 °C' },
    { id: '2000', on: recs.some((r) => (r.ele ?? 0) >= 2000), t: 'Por encima de 2.000 m', d: 'Dormir entre las cumbres' },
    { id: 'ref', on: shelters >= 3, t: '3 refugios o parapetos', d: 'Conociendo la sierra' },
  ]

  return (
    <div className="mx-auto max-w-xl px-4 pb-40" style={{ paddingTop: 'calc(var(--safe-t) + 60px)' }}>
      <h1 className="text-3xl font-semibold">Vuestro diario</h1>

      {recs.length === 0 ? (
        <div className="mt-6 flex flex-col items-center rounded-3xl p-8 text-center" style={{ background: 'var(--surface)' }}>
          <Illustration kind="vivac" className="h-36 w-full rounded-2xl" />
          <p className="font-display mt-4 text-xl font-semibold">Aún no hay noches</p>
          <p className="mt-1 text-sm" style={{ color: 'var(--ink-soft)' }}>Cuando durmáis fuera, pulsa <b>+</b> y «Dormimos aquí». Aparecerá aquí con foto, tiempo y recuerdos.</p>
        </div>
      ) : (
        <>
          <section className="mt-5 grid grid-cols-2 gap-3">
            {[
              { v: String(thisYear.length), l: `noches en ${year}` },
              { v: coldest?.wx ? t1(coldest.wx.tmin) : '–', l: 'la más fría' },
              { v: highest?.ele ? `${Math.round(highest.ele)} m` : '–', l: 'la más alta' },
              { v: String(shelters), l: 'refugios y parapetos' },
            ].map((s) => <div key={s.l} className="rounded-3xl p-4" style={{ background: 'var(--surface)' }}><p className="font-display text-3xl font-bold">{s.v}</p><p className="text-sm" style={{ color: 'var(--ink-soft)' }}>{s.l}</p></div>)}
          </section>

          {ago.length > 0 && (
            <button onClick={() => setOpen(ago[0].id)} className="mt-4 w-full rounded-3xl p-4 text-left" style={{ background: 'var(--accent)', color: '#fff' }}>
              <p className="text-sm font-semibold opacity-90">Hace un año</p>
              <p className="font-display text-xl font-semibold">Dormisteis en {ago[0].name}</p>
            </button>
          )}

          <section className="mt-6"><h2 className="mb-2 text-xl font-semibold">Mapa de calor</h2><Heat pts={recs} ctx={catalogDots} /></section>

          <section className="mt-6">
            <h2 className="mb-2 text-xl font-semibold">Logros</h2>
            <ul className="grid grid-cols-2 gap-2">
              {badges.map((b) => <li key={b.id} className="flex items-center gap-2 rounded-2xl p-3 text-sm" style={{ background: 'var(--surface)', opacity: b.on ? 1 : 0.45 }}><Award size={22} color={b.on ? '#e5b23a' : 'currentColor'} /><span><b className="block leading-tight">{b.t}</b><span className="text-xs" style={{ color: 'var(--ink-soft)' }}>{b.d}</span></span></li>)}
            </ul>
          </section>

          <section className="mt-6">
            <h2 className="mb-2 text-xl font-semibold">Línea del tiempo</h2>
            <ul className="flex flex-col gap-4">
              {recs.map((r) => (
                <li key={r.id}>
                  <button onClick={() => setOpen(r.id)} className="block w-full overflow-hidden rounded-3xl text-left shadow-sm active:scale-[0.99]" style={{ background: 'var(--surface)' }}>
                    <Cover r={r} className="h-44 w-full" />
                    <div className="flex items-center justify-between gap-3 p-4">
                      <div className="min-w-0"><p className="truncate font-display text-xl font-semibold">{r.name}</p><p className="text-sm" style={{ color: 'var(--ink-soft)' }}>{fmtDate(r.at)}{r.wx ? ` · mínima ${t1(r.wx.tmin)}` : ''}</p></div>
                      <span className="text-4xl" aria-label={r.sleep ? FACE_TXT[r.sleep] : 'Sin valorar'}>{r.sleep ? FACE[r.sleep] : '❔'}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
      <Detail r={recs.find((r) => r.id === open) ?? null} onClose={() => setOpen(null)} />
    </div>
  )
}
