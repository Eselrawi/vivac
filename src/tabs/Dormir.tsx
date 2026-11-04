import { useMemo, useState } from 'react'
import clsx from 'clsx'
import * as SunCalc from 'suncalc'
import { HOME, KIND_LABEL, type Place } from '../lib/types'

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function useDays(n = 14) {
  return useMemo(() => {
    const out: { date: Date; label: string; sub: string }[] = []
    for (let i = 0; i < n; i++) {
      const d = new Date()
      d.setDate(d.getDate() + i)
      d.setHours(12, 0, 0, 0)
      out.push({ date: d, label: i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : DIAS[d.getDay()], sub: String(d.getDate()) })
    }
    return out
  }, [n])
}

export default function Dormir({ places, onOpen }: { places: Place[]; onOpen: (p: Place) => void }) {
  const days = useDays()
  const [sel, setSel] = useState(0)
  const day = days[sel]
  const sun = SunCalc.getTimes(day.date, HOME.lat, HOME.lng)
  const fmt = (d: Date | null) => !d ? '--:--' : d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  const sleepable = places.filter((p) => p.kind !== 'parking' && p.kind !== 'fuente')

  return (
    <div className="mx-auto max-w-xl px-4 pb-32" style={{ paddingTop: 'calc(var(--safe-t) + 16px)' }}>
      <h1 className="text-3xl font-semibold">¿Dónde dormimos?</h1>
      <div className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-2">
        {days.map((d, i) => (
          <button
            key={i}
            onClick={() => setSel(i)}
            className={clsx('tap flex min-w-16 flex-col items-center rounded-2xl px-3 py-2 font-semibold transition-colors')}
            style={{ background: i === sel ? 'var(--accent)' : 'var(--surface)', color: i === sel ? '#fff' : 'var(--ink)' }}
          >
            <span className="text-xs opacity-80">{d.label}</span>
            <span className="text-xl">{d.sub}</span>
          </button>
        ))}
      </div>

      <p className="mt-3 text-sm" style={{ color: 'var(--ink-soft)' }}>
        Puesta de sol en {HOME.name}: <b>{fmt(sun.sunset)}</b> · Amanece a las <b>{fmt(sun.sunrise)}</b>
      </p>

      <h2 className="mt-6 text-xl font-semibold">Sitios para dormir</h2>
      {sleepable.length === 0 ? (
        <div className="mt-3 rounded-3xl p-8 text-center" style={{ background: 'var(--surface)' }}>
          <div className="text-5xl">🏔️</div>
          <p className="font-display mt-3 text-xl font-semibold">Aún no hay sitios</p>
          <p className="mt-1 text-sm" style={{ color: 'var(--ink-soft)' }}>Pulsa + y cuéntanos dónde dormisteis.</p>
        </div>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {sleepable.map((p) => (
            <li key={p.id}>
              <button onClick={() => onOpen(p)} className="tap w-full rounded-2xl p-4 text-left shadow-sm" style={{ background: 'var(--surface)' }}>
                <span className="block text-lg font-bold">{p.name}</span>
                <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>{KIND_LABEL[p.kind]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
