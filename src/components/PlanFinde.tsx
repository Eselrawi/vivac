import { useMemo, useRef, useState } from 'react'
import { Drawer } from 'vaul'
import { CalendarPlus, Check, Download, MessageCircle, Plus, ShieldAlert } from 'lucide-react'
import CloseBtn from './CloseBtn'
import { ScoreRing } from './ui'
import { ESTADO_UI, useAcceso } from '../lib/acceso'
import { hhmm } from '../lib/access'
import { db, useLive } from '../lib/db'
import { type Finde, type Pick, SAFETY, makeIcs, timeline } from '../lib/finde'
import { fmtDur } from '../lib/geo'
import { distribute, recommend, totalG } from '../lib/pack'
import { downloadTiles, tilesFor } from '../lib/offline'
import { evaluate, type Ctx } from '../lib/plan'
import { setPrefs } from '../lib/prefs'
import { downloadVector, hasVector } from '../lib/vec'
import { KIND_LABEL, type Place } from '../lib/types'

export interface Trip { placeId: string; date: string; people: string[]; parkingId?: string; score?: number; alts?: string[] }

interface Props {
  /** Plan elegido por «Hazme el plan del finde», o un único sitio desde su ficha. */
  finde: Finde | null
  single: { place: Place; dayIdx: number } | null
  days: Date[]
  ctx: Ctx
  places: Place[]
  onClose: () => void
}

const dayTxt = (d: Date) => d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })

export default function PlanFinde({ finde, single, days, ctx, onClose }: Props) {
  const open = !!(finde || single)
  const picks: Pick[] = useMemo(() => {
    if (finde) return [finde.primary, ...finde.alts]
    if (single) {
      const e = evaluate(single.place, days[single.dayIdx], ctx)
      return e ? [{ dayIdx: single.dayIdx, entry: e }] : []
    }
    return []
  }, [finde, single, days, ctx])
  const [sel, setSel] = useState(0)
  const pick = picks[Math.min(sel, picks.length - 1)]
  const e = pick?.entry
  const [going, setGoing] = useState<string[]>(ctx.prefs.names)
  const [name, setName] = useState('')
  const [saved, setSaved] = useState(false)
  const [dl, setDl] = useState<{ done: number; total: number } | null>(null)
  const [dlMsg, setDlMsg] = useState('')
  const [back, setBack] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 2); d.setHours(14, 0, 0, 0); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) })
  const abort = useRef<AbortController | null>(null)
  const gear = useLive(() => db.gear.toArray(), [])
  const acc = useAcceso()
  const eff = e ? acc.effective(e.place.id) : null
  const who = going.length ? going : ['Yo']

  const steps = useMemo(() => (e ? timeline(e, ctx, eff?.estado === 'llave' ? (eff.acceso?.llave ?? null) : undefined) : []), [e, ctx, eff])
  const lines = useMemo(() => (e ? recommend(e, gear, ctx.prefs.coldMargin) : []), [e, gear, ctx.prefs.coldMargin])
  const split = useMemo(() => distribute(lines.filter((l) => l.shared), who), [lines, who])
  const a = e?.access[0]
  const fuel = a ? (a.driveKm * 2 * (ctx.prefs.consumption / 100) * ctx.prefs.fuelPrice) / who.length : 0
  const priceTxt = eff?.acceso?.precio ? `${eff.acceso.precio.texto}${eff.acceso.precio.fecha ? ` (${eff.acceso.precio.fecha})` : ''}` : null

  const text = () => {
    if (!e) return ''
    const l = [`⛺ ${e.place.name} (${KIND_LABEL[e.place.kind]}) · ${dayTxt(days[pick.dayIdx])}`, `👥 ${who.join(', ')}`, `🌡️ ${e.text}`, '', ...steps.map((s) => `${hhmm(s.at)} ${s.icon} ${s.title}${s.detail ? ` — ${s.detail}` : ''}`)]
    for (const [p, ls] of Object.entries(split)) if (ls.length) l.push(`🎒 ${p}: ${ls.map((x) => x.label).join(', ')}`)
    if (a) l.push(`⛽ ≈ ${fuel.toFixed(2)} € por persona`)
    if (eff?.estado === 'reserva') l.push(`📅 Hay que reservar. Precio: ${priceTxt ?? 'consultar'}.`)
    l.push(`📍 https://www.google.com/maps?q=${e.place.lat},${e.place.lng}`)
    return l.join('\n')
  }
  const whatsapp = async () => {
    const t = text()
    if (navigator.share) await navigator.share({ title: 'Plan de vivac', text: t }).catch(() => {})
    else window.open(`https://wa.me/?text=${encodeURIComponent(t)}`, '_blank')
  }
  const calendar = () => {
    if (!e || !steps.length) return
    const start = steps[0].at, end = steps[steps.length - 1].at
    const ics = makeIcs({ title: `Vivac: ${e.place.name}`, start, end, description: text(), lat: e.place.lat, lng: e.place.lng, location: e.place.name })
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }))
    const el = document.createElement('a')
    el.href = url; el.download = 'vivac.ics'; el.click()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
  }
  const save = async () => {
    if (!e) return
    await db.kv.put({ k: 'trip', v: { placeId: e.place.id, date: days[pick.dayIdx].toISOString(), people: who, parkingId: a?.parking.id, score: e.score.score, alts: picks.filter((p) => p !== pick).map((p) => p.entry.place.id) } satisfies Trip })
    setSaved(true)
  }
  const warn = (phone?: string) => {
    if (!e) return
    const when = new Date(back).toLocaleString('es-ES', { weekday: 'long', hour: '2-digit', minute: '2-digit' })
    const t = `Aviso de salida: voy a ${e.place.name} con ${who.join(', ')}. Salimos ${dayTxt(days[pick.dayIdx])}${a ? ` desde ${a.parking.name}` : ''}. Hora prevista de vuelta: ${when}. Ruta: https://www.google.com/maps?q=${e.place.lat},${e.place.lng}. Si pasada esa hora no he dado señales, llama al 112 y dales este punto.`
    window.open(`https://wa.me/${phone ? phone.replace(/[^0-9]/g, '') : ''}?text=${encodeURIComponent(t)}`, '_blank')
  }
  const download = async () => {
    if (!e) return
    abort.current = new AbortController()
    setDlMsg(''); setDl({ done: 0, total: 1 })
    try {
      await navigator.storage?.persist?.()
      await fetch(`${import.meta.env.BASE_URL}data/graph.json`).catch(() => {})
      if (!(await hasVector())) await downloadVector((d, t) => setDl({ done: d, total: t }))
      const pts = [e.place, ...(a ? [a.parking] : [])]
      const pad = 0.05
      const b = { w: Math.min(...pts.map((p) => p.lng)) - pad, e: Math.max(...pts.map((p) => p.lng)) + pad, s: Math.min(...pts.map((p) => p.lat)) - pad, n: Math.max(...pts.map((p) => p.lat)) + pad }
      const list = tilesFor(b, ['ign', 'mtn', 'dem'], 10, 15)
      const r = await downloadTiles(list, (d, t) => setDl({ done: d, total: t }), abort.current.signal)
      setDlMsg(r.failed ? `Descargado con ${r.failed} fallos: vuelve a pulsar para completar.` : `Listo: ruta y mapa de la zona guardados (${list.length.toLocaleString('es-ES')} teselas).`)
    } catch { setDlMsg('No se pudo descargar. Prueba con wifi.') }
    setDl(null)
  }
  const close = () => { abort.current?.abort(); setSel(0); setSaved(false); setDlMsg(''); onClose() }
  const card = { background: 'var(--surface)' }

  return (
    <Drawer.Root open={open} onOpenChange={(o) => !o && close()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[60] bg-black/40" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 mx-auto max-w-xl z-[70] flex max-h-[94dvh] flex-col rounded-t-3xl outline-none" style={{ background: 'var(--bg)' }}>
          <CloseBtn onClick={close} />
          <div className="px-5 pt-5"><Drawer.Handle /></div>
          <div data-vaul-no-drag className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-10">
            <Drawer.Title className="pr-12 font-display mt-3 text-2xl font-semibold">{finde ? 'Plan del finde' : 'Planear salida'}</Drawer.Title>
            <Drawer.Description className="text-sm" style={{ color: 'var(--ink-soft)' }}>Todo el finde en una pantalla: horario, mochila, coste y seguridad.</Drawer.Description>

            {!e ? (
              <p className="mt-4 rounded-2xl p-4" style={card}>No hay previsión para armar el plan ahora mismo. Pulsa actualizar en Dormir y vuelve a intentarlo.</p>
            ) : (
              <>
                {picks.length > 1 && (
                  <div className="mt-3 grid grid-cols-3 gap-1 rounded-2xl p-1" style={card} role="tablist" aria-label="Plan principal o planes B">
                    {picks.map((p, i) => <button key={p.entry.place.id} role="tab" aria-selected={sel === i} onClick={() => setSel(i)} className="tap rounded-xl text-sm font-bold" style={{ background: sel === i ? 'var(--accent)' : 'transparent', color: sel === i ? '#fff' : 'var(--ink)' }}>{i === 0 ? 'Principal' : `Plan B ${i}`}</button>)}
                  </div>
                )}

                <div className="mt-3 flex items-center gap-4 rounded-3xl p-4" style={card}>
                  <ScoreRing score={e.score.score} size={68} />
                  <div className="min-w-0">
                    <p className="font-display text-xl font-semibold leading-tight">{e.place.name}</p>
                    <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>{KIND_LABEL[e.place.kind]}{e.place.ele ? ` · ${e.place.ele} m` : ''} · {dayTxt(days[pick.dayIdx])}</p>
                  </div>
                </div>
                <p className="mt-2 rounded-2xl p-3 font-display leading-snug" style={card}>{e.text}</p>
                {eff && <p className="mt-2 text-sm font-semibold">{ESTADO_UI[eff.estado].emoji} {ESTADO_UI[eff.estado].label}{eff.estado === 'reserva' ? ` · ${priceTxt ?? 'precio: consultar'}. Hay que reservar.` : eff.estado === 'sin_datos' ? ' · no cuentes con entrar: lleva también tu refugio.' : ''}</p>}

                <h3 className="mt-5 text-lg font-semibold">Quién viene</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {ctx.prefs.names.map((n) => <button key={n} aria-pressed={going.includes(n)} onClick={() => setGoing(going.includes(n) ? going.filter((x) => x !== n) : [...going, n])} className="tap rounded-full px-4 font-semibold" style={{ background: going.includes(n) ? 'var(--accent)' : 'var(--surface)', color: going.includes(n) ? '#fff' : 'var(--ink)' }}>{n}</button>)}
                </div>
                <div className="mt-2 flex gap-2">
                  <input value={name} onChange={(ev) => setName(ev.target.value)} placeholder="Añadir un amigo" className="tap min-w-0 flex-1 rounded-2xl border px-4" style={{ background: 'var(--surface)', borderColor: 'var(--line)', userSelect: 'text' }} />
                  <button aria-label="Añadir" disabled={!name.trim()} onClick={() => { const n = name.trim(); setPrefs({ names: [...ctx.prefs.names, n] }); setGoing([...going, n]); setName('') }} className="tap grid w-12 place-items-center rounded-2xl text-white disabled:opacity-40" style={{ background: 'var(--accent)' }}><Plus /></button>
                </div>

                <h3 className="mt-5 text-lg font-semibold">Horario</h3>
                <ol className="mt-2 flex flex-col gap-1.5">
                  {steps.map((s, i) => (
                    <li key={i} className="flex gap-3 rounded-2xl p-3" style={card}>
                      <span className="w-12 shrink-0 font-bold tabular-nums">{hhmm(s.at)}</span>
                      <span className="min-w-0"><b>{s.icon} {s.title}</b>{s.detail && <span className="block text-sm" style={{ color: 'var(--ink-soft)' }}>{s.detail}</span>}</span>
                    </li>
                  ))}
                </ol>

                <h3 className="mt-5 text-lg font-semibold">Mochila y material común</h3>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {Object.entries(split).map(([p, ls]) => <li key={p} className="rounded-2xl p-3 text-sm" style={card}><b>{p}</b>: {ls.length ? ls.map((x) => `${x.label} (${(x.weightG / 1000).toFixed(1)} kg)`).join(', ') : 'solo lo personal'}</li>)}
                </ul>
                <p className="mt-2 text-sm" style={{ color: 'var(--ink-soft)' }}>Tu mochila personal: unos {(totalG(lines, true) / 1000).toFixed(1)} kg. La lista completa con el porqué de cada cosa está en la pestaña Mochila.</p>

                <h3 className="mt-5 text-lg font-semibold">Coste</h3>
                <div className="mt-2 rounded-2xl p-3 text-sm" style={card}>
                  {a ? <>⛽ Gasolina ida y vuelta ≈ <b>{fuel.toFixed(2)} €</b> por persona ({who.length} en total).</> : 'Sin datos de acceso en coche.'}
                  <br />🏠 Refugio: <b>{eff?.estado === 'reserva' ? priceTxt ?? 'consultar' : e.place.kind === 'refugio_pago' ? 'consultar' : 'gratis (uso libre)'}</b>
                </div>

                <h3 className="mt-5 flex items-center gap-2 text-lg font-semibold"><ShieldAlert size={20} />Seguridad</h3>
                <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm">{SAFETY.map((s) => <li key={s}>{s}</li>)}</ul>
                <div className="mt-3 rounded-2xl p-3" style={card}>
                  <p className="font-semibold">Aviso a un contacto</p>
                  <label className="mt-1 block text-sm" style={{ color: 'var(--ink-soft)' }}>Hora prevista de vuelta
                    <input type="datetime-local" value={back} onChange={(ev) => setBack(ev.target.value)} className="tap mt-1 w-full rounded-xl border px-3" style={{ background: 'var(--bg)', borderColor: 'var(--line)', color: 'var(--ink)', userSelect: 'text' }} />
                  </label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {ctx.prefs.contacts.map((c) => <button key={c.phone} onClick={() => warn(c.phone)} className="tap rounded-full px-4 text-sm font-semibold" style={{ background: 'var(--bg)' }}>Avisar a {c.name}</button>)}
                    <button onClick={() => warn()} className="tap rounded-full px-4 text-sm font-semibold" style={{ background: 'var(--bg)' }}>Elegir contacto…</button>
                  </div>
                </div>

                <h3 className="mt-5 text-lg font-semibold">Sin cobertura</h3>
                <button onClick={download} disabled={!!dl} className="tap mt-2 flex w-full items-center justify-center gap-2 rounded-2xl py-3 font-bold disabled:opacity-60" style={card}><Download size={20} />{dl ? `Descargando… ${Math.round((dl.done / dl.total) * 100)} %` : 'Descargar ruta y mapa de este plan'}</button>
                {dlMsg && <p className="mt-1 text-sm">{dlMsg}</p>}
                {a && <p className="mt-1 text-xs" style={{ color: 'var(--ink-soft)' }}>Guarda el mapa, el relieve y los caminos de la zona ({fmtDur(a.walkMin)} a pie desde {a.parking.name}).</p>}

                <div className="mt-6 grid grid-cols-2 gap-2">
                  <button onClick={whatsapp} className="tap flex items-center justify-center gap-2 rounded-2xl py-3 font-bold text-white" style={{ background: '#25a244' }}><MessageCircle size={20} />WhatsApp</button>
                  <button onClick={calendar} className="tap flex items-center justify-center gap-2 rounded-2xl py-3 font-bold" style={card}><CalendarPlus size={20} />Calendario</button>
                </div>
                <button onClick={save} className="tap mt-2 flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-lg font-bold text-white" style={{ background: 'var(--accent)' }}>{saved ? <><Check size={22} />Plan guardado</> : 'Guardar este plan'}</button>
                {saved && <p className="mt-2 text-sm" style={{ color: 'var(--ink-soft)' }}>El día antes volveré a mirar la previsión y, si empeora, te propondré el plan B.</p>}
              </>
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
