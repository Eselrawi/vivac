import { useMemo, useState } from 'react'
import CloseBtn from '../components/CloseBtn'
import { Drawer } from 'vaul'
import { Plus, Trash2 } from 'lucide-react'
import { db, useLive } from '../lib/db'
import { CATS, distribute, recommend, totalG, type Cat, type GearItem } from '../lib/pack'
import { evaluate, type Ctx } from '../lib/plan'
import { setPrefs } from '../lib/prefs'
import type { Place } from '../lib/types'
import type { Trip } from '../components/PlanSheet'

const kg = (g: number) => `${(g / 1000).toFixed(g >= 10000 ? 0 : 1)} kg`

function AddGear({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [cat, setCat] = useState<Cat>('saco')
  const [name, setName] = useState('')
  const [w, setW] = useState('')
  const [v, setV] = useState('')
  const [shared, setShared] = useState(false)
  const needsValue = cat === 'saco' || cat === 'aislante'
  const save = async () => {
    await db.gear.add({ id: crypto.randomUUID(), cat, name: name.trim(), weightG: Math.max(0, parseInt(w) || 0), value: needsValue && v !== '' ? parseFloat(v.replace(',', '.')) : null, shared: cat === 'cocina' ? shared : undefined })
    setName(''); setW(''); setV(''); setShared(false)
    onClose()
  }
  const inp = 'tap w-full rounded-2xl border px-4 text-lg'
  const st = { background: 'var(--surface)', borderColor: 'var(--line)', userSelect: 'text' as const }
  return (
    <Drawer.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[60] bg-black/40" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 mx-auto max-w-xl z-[70] rounded-t-3xl p-5 pb-8 outline-none" style={{ background: 'var(--bg)' }}>
          <CloseBtn onClick={onClose} />
          <Drawer.Handle />
          <Drawer.Title className="pr-12 font-display mt-3 text-2xl font-semibold">Añadir material</Drawer.Title>
          <Drawer.Description className="sr-only">Nuevo objeto de tu mochila</Drawer.Description>
          <div className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5">
            {CATS.map((c) => <button key={c.id} onClick={() => setCat(c.id)} aria-pressed={cat === c.id} className="tap shrink-0 rounded-full px-4 text-sm font-semibold" style={{ background: cat === c.id ? 'var(--accent)' : 'var(--surface)', color: cat === c.id ? '#fff' : 'var(--ink)' }}>{c.emoji} {c.label}</button>)}
          </div>
          <div className="mt-4 flex flex-col gap-3">
            <input className={inp} style={st} placeholder="Nombre (p. ej. Saco Cumulus)" value={name} onChange={(e) => setName(e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <input className={inp} style={st} inputMode="numeric" placeholder="Peso (g)" value={w} onChange={(e) => setW(e.target.value)} />
              {needsValue && <input className={inp} style={st} inputMode="decimal" placeholder={cat === 'saco' ? 'Confort (°C)' : 'Valor R'} value={v} onChange={(e) => setV(e.target.value)} />}
            </div>
            {cat === 'cocina' && <label className="flex items-center gap-2"><input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} className="h-5 w-5" /> Es material común del grupo</label>}
            <button disabled={!name.trim()} onClick={save} className="tap rounded-2xl py-3 text-lg font-bold text-white disabled:opacity-40" style={{ background: 'var(--accent)' }}>Guardar</button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

export default function Mochila({ places, ctx }: { places: Place[]; ctx: Ctx }) {
  const gear = useLive(() => db.gear.toArray(), [] as GearItem[])
  const trip = useLive(async () => (await db.kv.get('trip'))?.v as Trip | undefined, undefined)
  const checks = useLive(async () => ((await db.kv.get('checks'))?.v ?? {}) as Record<string, boolean>, {} as Record<string, boolean>)
  const [add, setAdd] = useState(false)
  const m = ctx.prefs.coldMargin

  const place = trip ? places.find((p) => p.id === trip.placeId) : undefined
  const entry = useMemo(() => (place && trip ? evaluate(place, new Date(trip.date), ctx, trip.parkingId) : null), [place, trip, ctx])
  const lines = useMemo(() => (entry ? recommend(entry, gear, m) : []), [entry, gear, m])
  const people = trip?.people ?? ['Yo']
  const mine = distribute(lines.filter((l) => l.shared), people)[people[0]] ?? []
  const personal = lines.filter((l) => !l.shared)
  const myLoad = totalG(personal) + mine.reduce((a, l) => a + l.weightG, 0)

  const tick = (k: string) => db.kv.put({ k: 'checks', v: { ...checks, [k]: !checks[k] } })
  const adj = (d: number) => setPrefs({ coldMargin: Math.max(-4, Math.min(8, Math.round((m + d) * 10) / 10)) })

  return (
    <div className="mx-auto max-w-xl px-4 pb-40" style={{ paddingTop: 'calc(var(--safe-t) + 60px)' }}>
      <h1 className="text-3xl font-semibold">Tu mochila</h1>

      <section className="mt-5 rounded-3xl p-4" style={{ background: 'var(--surface)' }}>
        <p className="font-semibold">🌡️ Mi termómetro</p>
        <p className="mt-1 text-sm" style={{ color: 'var(--ink-soft)' }}>
          {m > 0.4 ? `Sueles pasar frío: te sumo ${m} °C de margen.` : m < -0.4 ? `Sueles ir sobrado de calor: te resto ${Math.abs(m)} °C.` : 'De momento, sin ajuste personal. Se afina con cada noche que valoráis.'}
        </p>
        <div className="mt-3 flex items-center gap-3">
          <button className="tap h-11 w-11 rounded-full text-xl font-bold" style={{ background: 'var(--bg)' }} onClick={() => adj(-0.5)} aria-label="Menos margen">−</button>
          <div className="h-2 flex-1 rounded-full" style={{ background: 'var(--line)' }}><div className="h-2 rounded-full" style={{ width: `${((m + 4) / 12) * 100}%`, background: 'var(--accent)' }} /></div>
          <button className="tap h-11 w-11 rounded-full text-xl font-bold" style={{ background: 'var(--bg)' }} onClick={() => adj(0.5)} aria-label="Más margen">+</button>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-xl font-semibold">Próxima salida</h2>
        {!trip || !place ? (
          <div className="mt-3 rounded-3xl p-6 text-center" style={{ background: 'var(--surface)' }}>
            <p className="text-4xl">🗓️</p>
            <p className="mt-2 font-semibold">Aún no hay salida planeada</p>
            <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>Elige un sitio en «Dormir», pulsa «Planear» y aquí saldrá qué llevar.</p>
          </div>
        ) : !entry ? (
          <p className="mt-3 rounded-3xl p-4 text-sm" style={{ background: 'var(--surface)' }}>Para {place.name} aún no hay previsión disponible.</p>
        ) : (
          <>
            <p className="mt-1 text-sm" style={{ color: 'var(--ink-soft)' }}>{place.name} · {new Date(trip.date).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            <p className="mt-2 rounded-2xl p-3 font-display" style={{ background: 'var(--surface)' }}>{entry.text}</p>
            <ul className="mt-3 flex flex-col gap-2">
              {[...personal, ...mine].map((l) => (
                <li key={l.key}>
                  <label className="flex cursor-pointer items-start gap-3 rounded-2xl p-3" style={{ background: 'var(--surface)', outline: l.alert ? '2px solid #e5b23a' : 'none' }}>
                    <input type="checkbox" checked={!!checks[l.key]} onChange={() => tick(l.key)} className="mt-1 h-6 w-6 shrink-0" style={{ accentColor: 'var(--accent)' }} />
                    <span className="min-w-0 flex-1">
                      <b className={checks[l.key] ? 'line-through opacity-60' : ''}>{l.label}</b>{l.shared && <span className="ml-1 text-xs" style={{ color: 'var(--accent)' }}>· tú llevas lo común</span>}
                      <span className="block text-xs" style={{ color: 'var(--ink-soft)' }}>{l.missing ? 'No lo tienes apuntado. ' : ''}{l.reason}</span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold">{kg(l.weightG)}</span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-right font-bold">Tu mochila: {kg(myLoad)}</p>
          </>
        )}
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between"><h2 className="text-xl font-semibold">Mi material</h2><button onClick={() => setAdd(true)} className="tap inline-flex items-center gap-1 rounded-full px-4 font-semibold text-white" style={{ background: 'var(--accent)' }}><Plus size={18} />Añadir</button></div>
        {gear.length === 0 ? (
          <p className="mt-3 rounded-3xl p-5 text-center text-sm" style={{ background: 'var(--surface)' }}>🎒 Apunta tu material una sola vez (saco, aislante, ropa…) y la app elegirá lo mejor para cada noche.</p>
        ) : (
          CATS.filter((c) => gear.some((g) => g.cat === c.id)).map((c) => (
            <div key={c.id} className="mt-3 rounded-3xl p-4" style={{ background: 'var(--surface)' }}>
              <p className="font-semibold">{c.emoji} {c.label} <span className="text-xs font-normal" style={{ color: 'var(--ink-soft)' }}>· {kg(gear.filter((g) => g.cat === c.id).reduce((a, g) => a + g.weightG, 0))}</span></p>
              <ul className="mt-1">
                {gear.filter((g) => g.cat === c.id).map((g) => (
                  <li key={g.id} className="flex items-center justify-between gap-2 py-1.5">
                    <span>{g.name}{g.value != null && <span className="text-xs" style={{ color: 'var(--ink-soft)' }}> · {c.id === 'saco' ? `${g.value} °C` : `R ${g.value}`}</span>}{g.shared && <span className="text-xs"> · común</span>}</span>
                    <span className="flex items-center gap-2 text-sm"><span>{g.weightG} g</span><button aria-label={`Borrar ${g.name}`} className="tap grid h-10 w-10 place-items-center rounded-full" onClick={() => db.gear.delete(g.id)}><Trash2 size={16} /></button></span>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
      <AddGear open={add} onClose={() => setAdd(false)} />
    </div>
  )
}
