import { useMemo, useState } from 'react'
import { Drawer } from 'vaul'
import { Check, Plus, Share2 } from 'lucide-react'
import { db } from '../lib/db'
import { evaluate, type Ctx } from '../lib/plan'
import { distribute, recommend, totalG } from '../lib/pack'
import { hhmm } from '../lib/access'
import { fmtDur } from '../lib/geo'
import { setPrefs } from '../lib/prefs'
import { KIND_LABEL, type Place } from '../lib/types'
import { useLive } from '../lib/db'

export interface Trip { placeId: string; date: string; people: string[]; parkingId?: string }

export default function PlanSheet({ place, day, ctx, onClose }: { place: Place | null; day: Date; ctx: Ctx; onClose: () => void }) {
  const [step, setStep] = useState(0)
  const [going, setGoing] = useState<string[]>(ctx.prefs.names)
  const [name, setName] = useState('')
  const [parking, setParking] = useState<string | undefined>()
  const [saved, setSaved] = useState(false)
  const [back, setBack] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(18, 0, 0, 0); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) })
  const gear = useLive(() => db.gear.toArray(), [])
  const e = useMemo(() => (place ? evaluate(place, day, ctx, parking) : null), [place, day, ctx, parking])
  const who = going.length ? going : ['Yo']
  const lines = useMemo(() => (e ? recommend(e, gear, ctx.prefs.coldMargin) : []), [e, gear, ctx.prefs.coldMargin])
  const shared = lines.filter((l) => l.shared)
  const split = useMemo(() => distribute(shared, who), [shared, who])
  const a = e?.access[0]
  const cost = a ? (a.driveKm * 2 * (ctx.prefs.consumption / 100) * ctx.prefs.fuelPrice) / who.length : 0
  const dateTxt = day.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })

  const text = () => {
    if (!place || !e) return ''
    const l = [`⛺ Salida: ${place.name} (${KIND_LABEL[place.kind]})`, `📅 ${dateTxt}`, `👥 ${who.join(', ')}`]
    if (a) l.push(`🚗 Salimos de ${ctx.prefs.homeName} antes de las ${hhmm(e.leave!)} (${fmtDur(a.driveMin)} a ${a.parking.name} + ${fmtDur(a.walkMin)} andando)`)
    l.push(`🌡️ ${e.text}`)
    for (const [p, ls] of Object.entries(split)) if (ls.length) l.push(`🎒 ${p}: ${ls.map((x) => x.label).join(', ')}`)
    if (a) l.push(`⛽ ≈ ${cost.toFixed(2)} € por persona`)
    if (place.kind === 'refugio_pago') l.push('📞 Es de pago: hay que reservar antes.')
    l.push(`📍 https://www.google.com/maps?q=${place.lat},${place.lng}`)
    return l.join('\n')
  }

  const finish = async () => {
    if (!place) return
    await db.kv.put({ k: 'trip', v: { placeId: place.id, date: day.toISOString(), people: who, parkingId: a?.parking.id } satisfies Trip })
    setSaved(true)
    const t = text()
    if (navigator.share) await navigator.share({ title: 'Salida', text: t }).catch(() => {})
    else window.open(`https://wa.me/?text=${encodeURIComponent(t)}`, '_blank')
  }
  const warn = (phone?: string) => {
    if (!place) return
    const when = new Date(back).toLocaleString('es-ES', { weekday: 'long', hour: '2-digit', minute: '2-digit' })
    const t = `Aviso de salida: voy a ${place.name} (${KIND_LABEL[place.kind]}) con ${who.join(', ')}. Salimos ${dateTxt}${a ? ` desde ${a.parking.name}` : ''}. Hora prevista de vuelta: ${when}. Ruta: https://www.google.com/maps?q=${place.lat},${place.lng}. Si pasada esa hora no he dado señales, llama al 112 y dales este punto.`
    window.open(`https://wa.me/${phone ? phone.replace(/[^0-9]/g, '') : ''}?text=${encodeURIComponent(t)}`, '_blank')
  }
  const close = () => { setStep(0); setSaved(false); setParking(undefined); onClose() }

  return (
    <Drawer.Root open={!!place} onOpenChange={(o) => !o && close()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[60] bg-black/40" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 mx-auto max-w-xl z-[70] max-h-[92dvh] rounded-t-3xl outline-none flex flex-col" style={{ background: 'var(--bg)' }}>
          <div className="px-5 pt-5"><Drawer.Handle /></div>
          <div data-vaul-no-drag className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-10">
          <Drawer.Title className="font-display mt-3 text-2xl font-semibold">Planear salida</Drawer.Title>
          <Drawer.Description className="text-sm" style={{ color: 'var(--ink-soft)' }}>{place?.name} · {dateTxt} · paso {step + 1} de 3</Drawer.Description>
          <div className="mt-3 flex gap-1.5" aria-hidden>{[0, 1, 2].map((i) => <i key={i} className="h-1.5 flex-1 rounded-full" style={{ background: i <= step ? 'var(--accent)' : 'var(--line)' }} />)}</div>

          {step === 0 && (
            <div className="mt-4">
              <p className="mb-2 font-semibold">¿Quién viene?</p>
              <div className="flex flex-wrap gap-2">
                {ctx.prefs.names.map((n) => (
                  <button key={n} aria-pressed={going.includes(n)} onClick={() => setGoing(going.includes(n) ? going.filter((x) => x !== n) : [...going, n])} className="tap rounded-full px-4 font-semibold" style={{ background: going.includes(n) ? 'var(--accent)' : 'var(--surface)', color: going.includes(n) ? '#fff' : 'var(--ink)' }}>{n}</button>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <input value={name} onChange={(ev) => setName(ev.target.value)} placeholder="Añadir un amigo" className="tap min-w-0 flex-1 rounded-2xl border px-4" style={{ background: 'var(--surface)', borderColor: 'var(--line)', userSelect: 'text' }} />
                <button aria-label="Añadir" disabled={!name.trim()} onClick={() => { const n = name.trim(); setPrefs({ names: [...ctx.prefs.names, n] }); setGoing([...going, n]); setName('') }} className="tap grid w-12 place-items-center rounded-2xl text-white disabled:opacity-40" style={{ background: 'var(--accent)' }}><Plus /></button>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="mt-4 flex flex-col gap-3">
              {!e || !a ? <p>No hay datos de acceso para este sitio todavía.</p> : (
                <>
                  <div className="rounded-3xl p-4" style={{ background: 'var(--surface)' }}>
                    <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>Salida desde {ctx.prefs.homeName}</p>
                    <p className="text-lg font-bold">🚗 {fmtDur(a.driveMin)} a {a.parking.name}</p>
                    <p className="text-lg font-bold">🥾 {fmtDur(a.walkMin)} andando ({a.walkKm.toFixed(1)} km)</p>
                    <p className="mt-2 rounded-2xl p-3 text-sm font-semibold" style={{ background: 'var(--bg)' }}>Sal de casa antes de las {hhmm(e.leave!)} para llegar con luz (puesta de sol {hhmm(e.night.sunset)}).</p>
                  </div>
                  {e.access.length > 1 && <div className="flex flex-wrap gap-2">{e.access.map((o) => <button key={o.parking.id} onClick={() => setParking(o.parking.id)} className="tap rounded-full px-3 py-1 text-xs font-semibold" style={{ background: o.parking.id === a.parking.id ? 'var(--accent)' : 'var(--surface)', color: o.parking.id === a.parking.id ? '#fff' : 'var(--ink)' }}>{o.parking.name} · {fmtDur(o.totalMin)}</button>)}</div>}
                  <p className="text-sm">⛽ Gasolina ≈ <b>{cost.toFixed(2)} €</b> por persona ({who.length} en total).</p>
                  {place?.kind === 'refugio_pago' && <p className="rounded-2xl p-3 text-sm font-semibold" style={{ background: '#e5b23a33' }}>Este refugio es de pago: el precio hay que consultarlo y reservar antes. Comprueba también que esté abierto ese día.</p>}
                  <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>{e.text}</p>
                </>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="mt-4">
              <p className="mb-2 font-semibold">Material común repartido</p>
              <ul className="flex flex-col gap-2">
                {Object.entries(split).map(([p, ls]) => (
                  <li key={p} className="rounded-2xl p-3" style={{ background: 'var(--surface)' }}>
                    <b>{p}</b>: {ls.length ? ls.map((x) => `${x.label} (${(x.weightG / 1000).toFixed(1)} kg)`).join(', ') : 'solo lo personal'}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-sm" style={{ color: 'var(--ink-soft)' }}>Tu mochila personal pesa unos {(totalG(lines, true) / 1000).toFixed(1)} kg. Revisa la lista completa en la pestaña Mochila.</p>
              <div className="mt-4 rounded-2xl p-3" style={{ background: 'var(--surface)' }}>
                <p className="font-semibold">Aviso de salida a un contacto</p>
                <label className="mt-1 block text-sm" style={{ color: 'var(--ink-soft)' }}>Hora prevista de vuelta
                  <input type="datetime-local" value={back} onChange={(e) => setBack(e.target.value)} className="tap mt-1 w-full rounded-xl border px-3" style={{ background: 'var(--bg)', borderColor: 'var(--line)', color: 'var(--ink)', userSelect: 'text' }} />
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {ctx.prefs.contacts.map((c) => <button key={c.phone} onClick={() => warn(c.phone)} className="tap rounded-full px-4 text-sm font-semibold" style={{ background: 'var(--bg)' }}>Avisar a {c.name}</button>)}
                  <button onClick={() => warn()} className="tap rounded-full px-4 text-sm font-semibold" style={{ background: 'var(--bg)' }}>Elegir contacto…</button>
                </div>
              </div>
              {saved && <p className="mt-3 flex items-center gap-2 font-bold" style={{ color: 'var(--accent)' }}><Check /> Salida guardada</p>}
            </div>
          )}

          <div className="sticky bottom-0 -mx-5 mt-6 flex gap-3 px-5 pb-2 pt-3" style={{ background: 'var(--bg)' }}>
            {step > 0 && <button onClick={() => setStep(step - 1)} className="tap flex-1 rounded-2xl font-semibold" style={{ background: 'var(--surface)' }}>Atrás</button>}
            {step < 2 ? (
              <button onClick={() => setStep(step + 1)} className="tap flex-1 rounded-2xl py-3 text-lg font-bold text-white" style={{ background: 'var(--accent)' }}>Siguiente</button>
            ) : (
              <button onClick={finish} className="tap flex flex-[2] items-center justify-center gap-2 rounded-2xl py-3 text-lg font-bold text-white" style={{ background: 'var(--accent)' }}><Share2 size={20} />Guardar y compartir</button>
            )}
          </div>
        </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
