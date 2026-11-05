import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { CloudOff, List, Map as MapIcon, RefreshCw } from 'lucide-react'
import { Dot, Illustration, ScoreRing } from '../components/ui'
import { accessFor } from '../lib/access'
import { evaluate, evaluateLight, quickScore, type Ctx, type Entry } from '../lib/plan'
import { hhmm } from '../lib/access'
import { compass, fmtDur } from '../lib/geo'
import { CONF_COLOR, useEvidenceMap } from '../lib/evidence'
import { useLikes } from '../lib/likes'
import { setPrefs, usePrefs } from '../lib/prefs'
import { MODE_LABEL, type NightMode } from '../lib/score'
import { SLEEP_KINDS, KIND_LABEL, type Place } from '../lib/types'

const MapView = lazy(() => import('../components/MapView'))
const ago = (t: number) => { const m = Math.max(1, Math.round((Date.now() - t) / 60000)); return m < 90 ? `hace ${m} min` : `hace ${Math.round(m / 60)} h` }
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
type Fee = 'todos' | 'gratis' | 'pago'
type Near = 0 | 90 | 120

interface Props {
  places: Place[]
  winterOn: boolean
  onFinde: () => void
  days: Date[]
  dayIdx: number
  onDay: (i: number) => void
  ctx: Ctx
  status: { loading: boolean; error: boolean; refresh: () => void }
  onOpen: (p: Place) => void
}

const keyData = (e: Entry) => {
  const s = e.stats
  const bits = [`${Math.round(s.feels).toString().replace('-', '−')} °C sensación`]
  if (e.score.shelter.wind <= 0.35 && s.windMean >= 12) bits.push(`cubierto del ${compass(s.dir)}`)
  else if (s.windMean >= 20) bits.push(`${compass(s.dir)} ${Math.round(s.windMean)} km/h`)
  if (s.snow >= 1) bits.push('nieve')
  else if (s.precip >= 1) bits.push('lluvia')
  return bits.join(' · ')
}

const Chip = ({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) => (
  <button onClick={onClick} aria-pressed={on} className="tap shrink-0 rounded-full px-4 text-sm font-semibold" style={{ background: on ? 'var(--accent)' : 'var(--surface)', color: on ? '#fff' : 'var(--ink)', minHeight: 40 }}>
    {children}
  </button>
)

export default function Dormir({ places, winterOn, onFinde, days, dayIdx, onDay, ctx, status, onOpen }: Props) {
  const [view, setView] = useState<'lista' | 'mapa'>('lista')
  const [fee, setFee] = useState<Fee>('todos')
  const [near, setNear] = useState<Near>(0)
  const [techo, setTecho] = useState(false)
  const [parapeto, setParapeto] = useState(false)
  const [stars, setStars] = useState(false)
  const [noSnow, setNoSnow] = useState(false)
  const [never, setNever] = useState(false)
  const [lowToo, setLowToo] = useState(false)
  const { discover, nightMode } = usePrefs()
  const evs = useEvidenceMap()
  const likes = useLikes()
  const [onlyLiked, setOnlyLiked] = useState(false)
  const [waited, setWaited] = useState(false)
  useEffect(() => { const t = setTimeout(() => setWaited(true), 7000); return () => clearTimeout(t) }, [])
  const brief = (id: string) => evs?.[id]?.d.split(/(?<=\.)\s/)[0] ?? ''
  const [limit, setLimit] = useState(15)

  const sleepable = useMemo(
    () => places.filter((p) => (SLEEP_KINDS.includes(p.kind) || p.kind === 'candidato') && !(p.kind === 'abrigo' && p.toponym) && (lowToo || p.kind === 'vivac' || p.kind === 'deseo' || (p.ele ?? 9999) >= 1200)),
    [places, lowToo],
  )

  // Solo el día elegido al abrir (rápido); los puntitos de los demás días se calculan después, por tandas.
  const day = days[dayIdx]
  const gridDay = useMemo(() => sleepable.map((p) => evaluateLight(p, day, ctx)), [sleepable, day, ctx])
  const [dots, setDots] = useState<(number | null)[]>([])
  useEffect(() => {
    if (!ctx.wx) return
    let alive = true
    const out: (number | null)[] = []
    let day = 0, idx = 0, tops: number[] = []
    const step = () => {
      if (!alive || day >= days.length) return
      const end = Math.min(idx + 16, sleepable.length)
      for (; idx < end; idx++) { const s = quickScore(sleepable[idx], days[day], ctx); if (s != null) tops.push(s) }
      if (idx >= sleepable.length) {
        tops.sort((a, b) => b - a)
        const t3 = tops.slice(0, 3)
        out.push(t3.length ? Math.round(t3.reduce((a, b) => a + b, 0) / t3.length) : null)
        setDots([...out]); day++; idx = 0; tops = []
      }
      setTimeout(step, 16)
    }
    const t = setTimeout(step, 600)
    return () => { alive = false; clearTimeout(t) }
  }, [days, sleepable, ctx])

  const ranked = useMemo(() => {
    const list = gridDay.filter((e): e is Entry => !!e).filter((e) => {
      const p = e.place
      if (fee === 'gratis' && p.kind === 'refugio_pago') return false
      if (fee === 'pago' && p.kind !== 'refugio_pago') return false
      if (near && !(e.access[0] && e.access[0].totalMin <= near)) return false
      if (techo && !(p.shelter === 'cerrado' || p.shelter === 'techo' || p.kind === 'refugio_libre' || p.kind === 'refugio_pago' || p.kind === 'bunker')) return false
      if (parapeto && p.shelter !== 'parapeto') return false
      if (stars && !(e.stats.cloud < 30 && e.moon.fraction < 0.4)) return false
      if (noSnow && (e.stats.snowDepth >= 0.03 || e.stats.snow > 0.2)) return false
      if (never && p.visited) return false
      if (onlyLiked && likes.who(p.id).length === 0) return false
      if (winterOn && (p.kind === 'parapeto' || p.kind === 'candidato' || (p.kind === 'abrigo' && p.toponym) || p.shelter === 'raso' || (p.shelter == null && p.kind !== 'bunker' && p.kind !== 'abrigo' && p.kind !== 'refugio_libre' && p.kind !== 'refugio_pago'))) return false
      return true
    })
    const rank = (e: Entry) => e.score.score - (e.place.unnamed ? 25 : 0)
    return list.sort((a, b) => rank(b) - rank(a) || (a.access[0]?.totalMin ?? 999) - (b.access[0]?.totalMin ?? 999))
  }, [gridDay, fee, near, techo, parapeto, stars, noSnow, never, winterOn, onlyLiked, likes.version])

  const heroes = useMemo(() => ranked.slice(0, 3).map((e) => evaluate(e.place, day, ctx) ?? e), [ranked, day, ctx])
  const top = heroes[0]
  const dayLabel = dayIdx === 0 ? 'hoy' : dayIdx === 1 ? 'mañana' : day.toLocaleDateString('es-ES', { weekday: 'long' })
  const scored = useMemo(() => ranked.map((e) => ({ ...e.place, score: e.score.score })), [ranked])
  const pick = (id: string) => { const p = places.find((x) => x.id === id); if (p) onOpen(p) }

  const price = (p: Place) => (p.kind === 'refugio_pago' ? <span className="ml-2 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: '#e08a3533', color: '#b3641c' }}>De pago · consultar</span> : null)

  return (
    <div className="mx-auto max-w-xl pb-40" style={{ paddingTop: 'calc(var(--safe-t) + 60px)' }}>
      <div className="flex items-end justify-between gap-3 px-4">
        <h1 className="text-3xl font-semibold leading-tight">¿Dónde dormimos?</h1>
        <button onClick={status.refresh} aria-label="Actualizar previsión" className="tap grid h-11 w-11 place-items-center rounded-full" style={{ background: 'var(--surface)' }}>
          {status.error ? <CloudOff size={20} /> : <RefreshCw size={20} className={status.loading ? 'animate-spin' : ''} />}
        </button>
      </div>

      <button onClick={onFinde} className="tap mx-4 mt-4 flex w-[calc(100%-2rem)] items-center justify-center gap-2 rounded-2xl py-3 text-lg font-bold text-white shadow-lg active:scale-[0.99]" style={{ background: 'var(--accent)' }}>🗓️ Hazme el plan del finde</button>

      <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Día">
        {days.map((dd, i) => (
          <button key={i} role="tab" aria-selected={i === dayIdx} onClick={() => onDay(i)} className="tap flex min-w-[4.4rem] flex-col items-center rounded-2xl px-3 py-2 font-semibold transition-colors" style={{ background: i === dayIdx ? 'var(--accent)' : 'var(--surface)', color: i === dayIdx ? '#fff' : 'var(--ink)' }}>
            <span className="text-xs opacity-80">{i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : DIAS[dd.getDay()]}</span>
            <span className="text-xl leading-tight">{dd.getDate()}</span>
            <span className="mt-1 flex" style={{ lineHeight: 0 }}><Dot score={dots[i] ?? null} size={i === dayIdx ? 11 : 9} /></span>
          </button>
        ))}
      </div>

      {ctx.wx && (
        <p className="mx-4 mt-3 text-xs" style={{ color: 'var(--ink-soft)' }}>
          Previsión actualizada {ago(ctx.wx.fetchedAt)}{status.error ? ' · sin conexión: es la última guardada' : ''}.
        </p>
      )}
      <div className="mx-4 mt-3 grid grid-cols-3 gap-1 rounded-2xl p-1" style={{ background: 'var(--surface)' }} role="group" aria-label="Tipo de noche">
        {(Object.keys(MODE_LABEL) as NightMode[]).map((m) => (
          <button key={m} aria-pressed={nightMode === m} onClick={() => setPrefs({ nightMode: m })} className="tap rounded-xl text-sm font-bold" style={{ background: nightMode === m ? 'var(--accent)' : 'transparent', color: nightMode === m ? '#fff' : 'var(--ink)' }}>
            {m === 'comoda' ? '🛖 ' : m === 'aventura' ? '⛰️ ' : '✨ '}{MODE_LABEL[m]}
          </button>
        ))}
      </div>
      {status.error && !ctx.wx && <p className="mx-4 mt-3 rounded-2xl p-3 text-sm" style={{ background: '#e5b23a33' }}>No he podido cargar la previsión. Prueba con cobertura y pulsa el botón de actualizar.</p>}

      <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-4">
        <Chip on={onlyLiked} onClick={() => setOnlyLiked(!onlyLiked)}>❤️ Nos gustan</Chip>
        <Chip on={winterOn} onClick={() => setPrefs({ winter: winterOn ? 'no' : 'si' })}>❄️ Modo invierno cubierto</Chip>
        <Chip on={near === 90} onClick={() => setNear(near === 90 ? 0 : 90)}>Cerca &lt; 1 h 30</Chip>
        <Chip on={near === 120} onClick={() => setNear(near === 120 ? 0 : 120)}>&lt; 2 h</Chip>
        <Chip on={techo} onClick={() => setTecho(!techo)}>Con techo</Chip>
        <Chip on={parapeto} onClick={() => setParapeto(!parapeto)}>Parapeto</Chip>
        <Chip on={stars} onClick={() => setStars(!stars)}>Estrellas</Chip>
        <Chip on={noSnow} onClick={() => setNoSnow(!noSnow)}>Sin nieve</Chip>
        <Chip on={never} onClick={() => setNever(!never)}>Nunca hemos ido</Chip>
        <Chip on={lowToo} onClick={() => setLowToo(!lowToo)}>Incluir &lt; 1.200 m</Chip>
        <Chip on={discover} onClick={() => setPrefs({ discover: !discover })}>✨ Sugeridos por el relieve</Chip>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 px-4">
        <div className="inline-flex rounded-full p-1" style={{ background: 'var(--surface)' }} role="group" aria-label="Precio">
          {(['todos', 'gratis', 'pago'] as Fee[]).map((f) => (
            <button key={f} onClick={() => setFee(f)} className="tap rounded-full px-3 text-sm font-semibold" style={{ minHeight: 36, background: fee === f ? 'var(--accent)' : 'transparent', color: fee === f ? '#fff' : 'var(--ink)' }}>{f === 'todos' ? 'Todos' : f === 'gratis' ? 'Gratis' : 'De pago'}</button>
          ))}
        </div>
        <div className="inline-flex rounded-full p-1" style={{ background: 'var(--surface)' }} role="group" aria-label="Vista">
          <button onClick={() => setView('lista')} aria-label="Lista" aria-pressed={view === 'lista'} className="tap grid place-items-center rounded-full px-3" style={{ minHeight: 36, background: view === 'lista' ? 'var(--accent)' : 'transparent', color: view === 'lista' ? '#fff' : 'var(--ink)' }}><List size={18} /></button>
          <button onClick={() => setView('mapa')} aria-label="Mapa" aria-pressed={view === 'mapa'} className="tap grid place-items-center rounded-full px-3" style={{ minHeight: 36, background: view === 'mapa' ? 'var(--accent)' : 'transparent', color: view === 'mapa' ? '#fff' : 'var(--ink)' }}><MapIcon size={18} /></button>
        </div>
      </div>

      {!ctx.wx ? (
        <section className="px-4">
          <div className="mt-5 rounded-3xl p-5" style={{ background: 'var(--surface)' }}>
            {status.loading && !waited && !status.error ? (
              <p className="flex items-center gap-3 font-semibold"><RefreshCw className="animate-spin" size={20} />Cargando la previsión…</p>
            ) : (
              <>
                <p className="flex items-center gap-2 font-bold"><CloudOff size={20} />No tengo la previsión ahora mismo</p>
                <p className="mt-1 text-sm" style={{ color: 'var(--ink-soft)' }}>Puede ser la cobertura o que el servicio esté saturado. Los sitios se ven igualmente, sin nota de la noche.</p>
                <button onClick={status.refresh} className="tap mt-3 w-full rounded-2xl py-3 font-bold text-white" style={{ background: 'var(--accent)' }}>Reintentar</button>
              </>
            )}
          </div>
          <h2 className="mt-6 text-xl font-semibold">Sitios para dormir <span className="text-sm font-normal" style={{ color: 'var(--ink-soft)' }}>({sleepable.length})</span></h2>
          <ul className="mt-3 flex flex-col gap-2.5">
            {sleepable.slice(0, limit).map((p) => {
              const a = accessFor(p, ctx.parkings, ctx.drive)[0]
              return (
                <li key={p.id}>
                  <button onClick={() => onOpen(p)} className="tap flex w-full items-center gap-3 rounded-2xl p-3 text-left active:scale-[0.99]" style={{ background: 'var(--surface)' }}>
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl"><Illustration kind={p.kind} className="h-full w-full" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">{p.name}{price(p)}</p>
                      <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>{KIND_LABEL[p.kind]}{p.ele ? ` · ${p.ele} m` : ''}{a ? ` · 🚗 ${fmtDur(a.driveMin)} + 🥾 ${fmtDur(a.walkMin)}` : ''}</p>
                      {brief(p.id) && <p className="line-clamp-2 text-xs" style={{ color: 'var(--ink-soft)' }}>{brief(p.id)}</p>}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
          {sleepable.length > limit && <button onClick={() => setLimit(limit + 20)} className="tap mt-3 w-full rounded-2xl font-semibold" style={{ background: 'var(--surface)' }}>Ver más</button>}
        </section>
      ) : view === 'mapa' ? (
        <div className="relative mx-4 mt-4 overflow-hidden rounded-3xl" style={{ height: '58vh' }}>
          <Suspense fallback={<div className="grid h-full place-items-center">Cargando mapa…</div>}><MapView places={scored} onSelect={(p) => pick(p.id)} is3D={false} layer="mtn" scoreMode /></Suspense>
        </div>
      ) : ranked.length === 0 ? (
        <div className="mx-4 mt-6 rounded-3xl p-8 text-center" style={{ background: 'var(--surface)' }}>
          <p className="text-5xl">🏔️</p>
          <p className="font-display mt-3 text-xl font-semibold">Ningún sitio con esos filtros</p>
          <p className="mt-1 text-sm" style={{ color: 'var(--ink-soft)' }}>Quita algún filtro para ver más opciones.</p>
        </div>
      ) : (
        <>
          <section className="px-4">
            <h2 className="mt-5 text-xl font-semibold">La mejor noche para {dayLabel}</h2>
            {top && (
              <button onClick={() => onOpen(top.place)} className="mt-3 block w-full overflow-hidden rounded-3xl text-left shadow-lg active:scale-[0.99]" style={{ background: 'var(--surface)' }}>
                <div className="relative h-44">
                  <Illustration kind={top.place.kind} className="h-full w-full" />
                  <div className="absolute inset-x-0 bottom-0 h-24" style={{ background: 'linear-gradient(transparent, rgba(0,0,0,.55))' }} />
                  <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between text-white">
                    <div><p className="text-xs font-bold uppercase tracking-wider opacity-90">{KIND_LABEL[top.place.kind]}{top.place.ele ? ` · ${top.place.ele} m` : ''}</p><p className="font-display text-2xl font-semibold leading-tight">{top.place.name}</p></div>
                  </div>
                  <div className="absolute right-3 top-3 rounded-full p-1" style={{ background: 'var(--surface)' }}><ScoreRing score={top.score.score} size={56} /></div>
                </div>
                <div className="p-4">
                  <p className="font-display text-lg leading-snug">{top.text}</p>
                  {brief(top.place.id) && <p className="mt-2 text-sm" style={{ color: 'var(--ink-soft)' }}>{brief(top.place.id)}</p>}
                  {top.access[0] && (
                    <p className="mt-2 text-sm font-semibold">
                      🚗 {fmtDur(top.access[0].driveMin)} + 🥾 {fmtDur(top.access[0].walkMin)} desde casa
                      {top.leave && <> · sal antes de las {hhmm(top.leave)}</>}
                    </p>
                  )}
                  <p className="mt-1 text-xs" style={{ color: 'var(--ink-soft)' }}>Puesta de sol {hhmm(top.night.sunset)} · amanece {hhmm(top.night.sunrise)} (en {top.place.name})</p>
                  <span className="tap mt-3 flex items-center justify-center rounded-2xl font-bold text-white" style={{ background: 'var(--accent)' }}>Ver y planear</span>
                </div>
              </button>
            )}
            {heroes.length > 1 && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                {heroes.slice(1, 3).map((e) => (
                  <button key={e.place.id} onClick={() => onOpen(e.place)} className="overflow-hidden rounded-3xl text-left shadow-sm active:scale-[0.98]" style={{ background: 'var(--surface)' }}>
                    <div className="relative h-24"><Illustration kind={e.place.kind} className="h-full w-full" /><div className="absolute right-2 top-2 rounded-full p-0.5" style={{ background: 'var(--surface)' }}><ScoreRing score={e.score.score} size={40} /></div></div>
                    <div className="p-3"><p className="line-clamp-2 font-bold leading-tight">{e.place.name}</p><p className="mt-1 text-xs" style={{ color: 'var(--ink-soft)' }}>{keyData(e)}</p></div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="mt-6 px-4">
            <h2 className="text-xl font-semibold">Todos los sitios <span className="text-sm font-normal" style={{ color: 'var(--ink-soft)' }}>({ranked.length})</span></h2>
            <ul className="mt-3 flex flex-col gap-2.5">
              {ranked.slice(3, limit).map((e) => (
                <li key={e.place.id}>
                  <button onClick={() => onOpen(e.place)} className="tap flex w-full items-center gap-3 rounded-2xl p-3 text-left active:scale-[0.99]" style={{ background: 'var(--surface)' }}>
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl"><Illustration kind={e.place.kind} className="h-full w-full" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">{likes.who(e.place.id).length > 0 && <span aria-label="Nos gusta">❤️ </span>}{e.place.name}{price(e.place)}</p>
                      <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>{KIND_LABEL[e.place.kind]}{e.place.ele ? ` · ${e.place.ele} m` : ''}{e.access[0] ? ` · 🚗 ${fmtDur(e.access[0].driveMin)} + 🥾 ${fmtDur(e.access[0].walkMin)}` : ''}</p>
                      <p className="truncate text-xs font-semibold">{keyData(e)}</p>
                      {brief(e.place.id) && <p className="line-clamp-2 text-xs" style={{ color: 'var(--ink-soft)' }}>{evs?.[e.place.id] && <i className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: CONF_COLOR[evs[e.place.id].c] }} />}{brief(e.place.id)}</p>}
                    </div>
                    <ScoreRing score={e.score.score} size={46} />
                  </button>
                </li>
              ))}
            </ul>
            {ranked.length > limit && <button onClick={() => setLimit(limit + 20)} className="tap mt-3 w-full rounded-2xl font-semibold" style={{ background: 'var(--surface)' }}>Ver más</button>}
          </section>
        </>
      )}
    </div>
  )
}
