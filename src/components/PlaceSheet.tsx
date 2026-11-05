import { useEffect, useMemo, useState } from 'react'
import CloseBtn from './CloseBtn'
import { Drawer } from 'vaul'
import { ChevronsDown, ChevronsUp, AlertTriangle, BadgeCheck, CalendarCheck, Car, Globe, Phone, ExternalLink, Footprints, Navigation, Share2, Sunrise, Sunset, Wallet } from 'lucide-react'
import * as SunCalc from 'suncalc'
import { db, useLive } from '../lib/db'
import { KIND_LABEL, SLEEP_KINDS, type Place } from '../lib/types'
import { evaluate, evaluateLight, setOverride, type Ctx } from '../lib/plan'
import { DGT_URL, hhmm, isPass } from '../lib/access'
import { compass, fmtDur } from '../lib/geo'
import { cellKey } from '../lib/weather'
import { usePhotos } from '../lib/photos'
import { CONF_COLOR, CONF_LABEL, useEvidence } from '../lib/evidence'
import { getSb, GROUP_KEY } from '../lib/sb'
import { Dot, Illustration, NightChart, ScoreRing, WindRose } from './ui'

const DAY = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

interface Props {
  places: Place[]
  place: Place | null
  days: Date[]
  dayIdx: number
  ctx: Ctx
  onDay: (i: number) => void
  onClose: () => void
  onRoute: (p: Place) => void
  onPlan: (p: Place, dayIdx: number) => void
}

export default function PlaceSheet({ places, place, days, dayIdx, ctx, onDay, onClose, onRoute, onPlan }: Props) {
  const [picked, setPicked] = useState<string | undefined>()
  const [snap, setSnap] = useState<number | string | null>(0.5)
  useEffect(() => { setSnap(0.5) }, [place?.id])
  useEffect(() => {
    if (!place) return
    const k = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [place, onClose])
  const entries = useMemo(() => (place ? days.map((d) => evaluate(place, d, ctx, picked)) : []), [place, days, ctx, picked])
  const e = entries[dayIdx] ?? null
  const bestDay = entries.reduce((b, x, i) => (x && (b < 0 || x.score.score > (entries[b]?.score.score ?? -1)) ? i : b), -1)

  const share = async () => {
    if (!place) return
    const when = days[dayIdx].toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
    const text = `${place.name} (${KIND_LABEL[place.kind]}) · ${when}\n${e ? e.text + '\n' : ''}📍 https://www.google.com/maps?q=${place.lat},${place.lng}`
    if (navigator.share) await navigator.share({ title: place.name, text }).catch(() => {})
    else window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }

  const sleepKind = !!place && (SLEEP_KINDS.includes(place.kind) || place.kind === 'candidato')
  const water = useLive<Array<{ at: number; state: 'agua' | 'seca' | 'helada' }>>(async () => (place ? (((await db.kv.get(`water:${place.id}`))?.v as Array<{ at: number; state: 'agua' | 'seca' | 'helada' }>) ?? []) : []), [])
  const reportWater = async (state: 'agua' | 'seca' | 'helada') => {
    if (!place) return
    await db.kv.put({ k: `water:${place.id}`, v: [{ at: Date.now(), state }, ...water].slice(0, 12) })
    const gid = localStorage.getItem(GROUP_KEY)
    if (gid && navigator.onLine) await (await getSb()).from('place_notes').insert({ group_id: gid, place_ref: place.id, kind: 'water', data: { state } })
  }
  // Plan B: otro sitio cercano que esa noche vaya claramente mejor.
  const planB = useMemo(() => {
    if (!place || !sleepKind || !e || e.score.score >= 55) return null
    const day = days[dayIdx]
    let best: { p: Place; s: number } | null = null
    for (const q of places) {
      if (q.id === place.id || !SLEEP_KINDS.includes(q.kind) || (q.ele ?? 0) < 1200 || q.unnamed) continue
      if (Math.abs(q.lat - place.lat) > 0.12 || Math.abs(q.lng - place.lng) > 0.15) continue
      const x = evaluateLight(q, day, ctx)
      if (x && x.score.score >= e.score.score + 20 && (!best || x.score.score > best.s)) best = { p: q, s: x.score.score }
    }
    return best
  }, [place, sleepKind, e, days, dayIdx, places, ctx])
  const ev = useEvidence(place)
  const photos = usePhotos(place, ev?.ph)
  const [shot, setShot] = useState(0)
  const a = e?.access[0]
  const confirm = async () => {
    if (!place) return
    setOverride(place.id, { verified: true })
    const gid = localStorage.getItem(GROUP_KEY)
    if (gid && navigator.onLine) await (await getSb()).from('place_notes').insert({ group_id: gid, place_ref: place.id, kind: 'confirm', data: {} })
  }
  const sunsetOk = e && a && e.leave
  const dayName = (d: Date, i: number) => (i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : `${DAY[d.getDay()]} ${d.getDate()}`)

  return (
    <Drawer.Root open={!!place} onOpenChange={(o) => { if (!o) { onClose(); setPicked(undefined) } }} snapPoints={[0.5, 1]} activeSnapPoint={snap} setActiveSnapPoint={setSnap} modal={false} fadeFromIndex={1}>
      <Drawer.Portal>
        <Drawer.Content className="fixed inset-x-0 bottom-0 mx-auto max-w-xl z-40 flex h-full max-h-[96%] flex-col rounded-t-3xl shadow-2xl outline-none" style={{ background: 'var(--bg)' }}>
          <CloseBtn onClick={() => { onClose(); setPicked(undefined) }} />
          <button type="button" aria-label={snap === 1 ? 'Reducir ficha' : 'Ampliar ficha'} onClick={() => setSnap(snap === 1 ? 0.5 : 1)} className="tap absolute right-16 top-3 z-20 grid h-11 w-11 place-items-center rounded-full shadow-md active:scale-95" style={{ background: 'var(--surface)', color: 'var(--ink)' }}>{snap === 1 ? <ChevronsDown size={22} /> : <ChevronsUp size={22} />}</button>
          <Drawer.Handle className="mt-2 mb-1" />
          {place && (
            <div data-vaul-no-drag className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain pb-28">
              <div className="relative h-48 overflow-hidden">
                {photos.length ? (
                  <div className="no-scrollbar flex h-full snap-x snap-mandatory overflow-x-auto" onScroll={(ev) => setShot(Math.round(ev.currentTarget.scrollLeft / ev.currentTarget.clientWidth))}>
                    {photos.map((ph) => <img key={ph.url} src={ph.url} alt={ph.title} loading="lazy" className="h-full w-full shrink-0 snap-center object-cover" />)}
                  </div>
                ) : <Illustration kind={place.kind} className="h-full w-full" />}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20" style={{ background: 'linear-gradient(transparent, var(--bg))' }} />
              </div>
              {photos[shot] && <p className="px-5 text-[11px]" style={{ color: 'var(--ink-soft)' }}>{photos[shot].own === false ? 'Foto cercana (puede no ser del sitio)' : 'Foto'}: {photos[shot].author} · {photos[shot].license} · <a className="underline" href={photos[shot].page} target="_blank" rel="noreferrer">Wikimedia Commons</a></p>}
              <div className="mt-2 px-5">
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>
                  {KIND_LABEL[place.kind]}{place.kind === 'refugio_pago' && ' · De pago · precio: consultar'}
                </p>
                <Drawer.Title className="pr-12 font-display text-3xl font-semibold leading-tight">{place.name}</Drawer.Title>
                <Drawer.Description className="mt-1 text-sm" style={{ color: 'var(--ink-soft)' }}>
                  {place.ele ? `${place.ele} m` : ''}{place.eleDem ? ' (modelo de elevación)' : ''} · {place.verified ? 'Confirmado por el grupo' : 'Sin verificar'}
                </Drawer.Description>

                {ev && (
                  <div className="mt-3 rounded-3xl p-4" style={{ background: 'var(--surface)' }}>
                    <p className="flex items-center gap-2 text-sm font-bold"><i className="inline-block h-3 w-3 rounded-full" style={{ background: CONF_COLOR[ev.c] }} />{CONF_LABEL[ev.c]}</p>
                    <p className="mt-2 leading-snug">{ev.d}</p>
                    <details className="mt-2 text-sm">
                      <summary className="cursor-pointer font-semibold" style={{ color: 'var(--accent)' }}>¿Por qué lo creemos?</summary>
                      <ul className="mt-2 flex flex-col gap-1.5">
                        {ev.e.map((x, i) => <li key={i} style={{ opacity: x.weak ? 0.7 : 1 }}><b>{x.s}:</b> {x.t}{x.url && <> · <a className="underline" href={x.url} target="_blank" rel="noreferrer">ver</a></>}</li>)}
                      </ul>
                      <p className="mt-2 text-xs" style={{ color: 'var(--ink-soft)' }}>Ninguna fuente online garantiza que algo siga en pie. Confírmalo cuando vayas con «Existe: confirmar».</p>
                    </details>
                  </div>
                )}
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {[
                    { l: 'Cómo llegar', I: Navigation, f: () => onRoute(place) },
                    { l: 'Planear', I: CalendarCheck, f: () => onPlan(place, dayIdx) },
                    { l: 'Compartir', I: Share2, f: share },
                  ].map(({ l, I, f }) => (
                    <button key={l} onClick={f} className="tap flex flex-col items-center gap-1 rounded-2xl py-3 text-sm font-semibold active:scale-95" style={{ background: 'var(--surface)' }}>
                      <I size={22} />{l}
                    </button>
                  ))}
                </div>

                {(place.phone || place.web || place.kind === 'refugio_pago') && (
                  <div className="mt-4 rounded-3xl p-4" style={{ background: 'var(--surface)' }}>
                    <p className="font-semibold">Reservar</p>
                    <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>Precio por noche: consultar. Los precios que no están confirmados no los inventamos.</p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {place.phone && <a href={`tel:${place.phone}`} className="tap flex items-center justify-center gap-2 rounded-2xl font-semibold text-white" style={{ background: 'var(--accent)' }}><Phone size={18} />Llamar</a>}
                      {place.web && <a href={place.web} target="_blank" rel="noreferrer" className="tap flex items-center justify-center gap-2 rounded-2xl font-semibold" style={{ background: 'var(--bg)' }}><Globe size={18} />Web</a>}
                    </div>
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {!place.verified && place.source !== 'grupo' && <button onClick={confirm} className="tap inline-flex items-center gap-2 rounded-full px-4 text-sm font-semibold" style={{ background: 'var(--surface)' }}><BadgeCheck size={18} />Existe: confirmar</button>}
                  <a href={`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(place.name + ' Guadarrama')}`} target="_blank" rel="noreferrer" className="tap inline-flex items-center gap-2 rounded-full px-4 text-sm font-semibold" style={{ background: 'var(--surface)' }}><ExternalLink size={16} />Ver más fotos en la web</a>
                </div>
                <p className="mt-2 text-[11px]" style={{ color: 'var(--ink-soft)' }}>Fuente: {place.source}</p>

                {place.kind === 'fuente' && (
                  <div className="mt-4 rounded-3xl p-4" style={{ background: 'var(--surface)' }}>
                    <p className="font-semibold">💧 ¿Cómo está el agua?</p>
                    <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>{water[0] ? `Último aviso (${new Date(water[0].at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}): ${water[0].state === 'agua' ? 'sale agua' : water[0].state === 'seca' ? 'seca' : 'helada'}` : 'Nadie ha avisado aún. En verano suelen secarse y en invierno helarse: confirmadlo.'}</p>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-sm font-semibold">
                      {([['agua', '💧 Sale agua'], ['seca', '🏜️ Seca'], ['helada', '🧊 Helada']] as const).map(([k, l]) => <button key={k} onClick={() => reportWater(k)} className="tap rounded-2xl" style={{ background: 'var(--bg)' }}>{l}</button>)}
                    </div>
                  </div>
                )}

                {sleepKind && <h3 className="mt-6 text-lg font-semibold">Esta noche</h3>}
                {sleepKind && <div className="no-scrollbar -mx-5 mt-2 flex gap-2 overflow-x-auto px-5">
                  {days.map((d, i) => (
                    <button key={i} onClick={() => onDay(i)} className="tap flex min-w-[4.2rem] flex-col items-center rounded-2xl px-2 py-2 text-xs font-semibold" style={{ background: i === dayIdx ? 'var(--accent)' : 'var(--surface)', color: i === dayIdx ? '#fff' : 'var(--ink)', outline: i === bestDay ? '2px solid #e5b23a' : 'none' }}>
                      <span>{dayName(d, i)}</span>
                      <span className="mt-1 flex items-center gap-1"><Dot score={entries[i]?.score.score ?? null} size={10} /><b className="text-sm">{entries[i]?.score.score ?? '–'}</b></span>
                    </button>
                  ))}
                </div>}
                {sleepKind && bestDay >= 0 && <p className="mt-1 text-xs" style={{ color: 'var(--ink-soft)' }}>Mejor día para ir aquí: <b>{dayName(days[bestDay], bestDay)}</b> ({entries[bestDay]!.score.score} puntos)</p>}

                {!sleepKind ? null : !ctx.wx ? (
                  <p className="mt-4 rounded-2xl p-4 text-sm" style={{ background: 'var(--surface)' }}>Cargando la previsión… Si no hay cobertura, se verá la última guardada.</p>
                ) : !e ? (
                  <p className="mt-4 rounded-2xl p-4 text-sm" style={{ background: 'var(--surface)' }}>Aún no hay previsión para ese día en este punto.</p>
                ) : (
                  <>
                    {planB && <button onClick={() => { setPicked(undefined); onClose(); window.dispatchEvent(new CustomEvent('vivac-open', { detail: planB.p.id })) }} className="tap mt-4 block w-full rounded-3xl p-4 text-left" style={{ background: '#e5b23a33' }}><b>Plan B:</b> {planB.p.name} va mucho mejor esa noche ({planB.s} puntos). Toca para verlo.</button>}
                    <div className="mt-4 flex items-center gap-4 rounded-3xl p-4" style={{ background: 'var(--surface)' }}>
                      <ScoreRing score={e.score.score} size={72} />
                      <p className="font-display text-lg leading-snug">{e.text}</p>
                    </div>
                    <p className="mt-2 text-xs" style={{ color: 'var(--ink-soft)' }}>
                      Fiabilidad de la previsión: <b>{e.conf.label}</b> · {e.conf.text} · Luna: {e.moon.name} ({Math.round(e.moon.fraction * 100)} %)
                    </p>

                    <div className="mt-4 rounded-3xl p-4" style={{ background: 'var(--surface)' }}>
                      <NightChart stats={e.stats} />
                      <p className="mt-1 flex gap-4 text-xs" style={{ color: 'var(--ink-soft)' }}>
                        <span><i className="mr-1 inline-block h-2 w-3 rounded-sm" style={{ background: '#e08a35' }} />Temperatura</span>
                        <span><i className="mr-1 inline-block h-2 w-3 rounded-sm" style={{ background: '#3a86c8' }} />Viento y rachas</span>
                      </p>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-3xl p-4" style={{ background: 'var(--surface)' }}>
                        <Sunset size={18} className="mb-1" />Puesta de sol <b className="block text-lg">{hhmm(e.night.sunset)}</b>
                        <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>en {place.name}</span>
                      </div>
                      <div className="rounded-3xl p-4" style={{ background: 'var(--surface)' }}>
                        <Sunrise size={18} className="mb-1" />Amanece a las <b className="block text-lg">{hhmm(e.night.sunrise)}</b>
                        <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>{dayName(new Date(days[dayIdx].getTime() + 86400000), dayIdx + 1).toLowerCase()}, en {place.name}{(() => { const az = (SunCalc.getPosition(e.night.sunrise, place.lat, place.lng).azimuth * 180) / Math.PI + 180; return ` · sale por el ${compass(az)}` })()}</span>
                      </div>
                    </div>

                    <div className="mt-4 rounded-3xl p-4" style={{ background: 'var(--surface)' }}>
                      <p className="mb-1 flex items-center gap-2 font-semibold"><Wallet size={18} />Protección y viento</p>
                      <div className="flex items-center gap-4">
                        <WindRose
                          size={132}
                          sheltered={place.shelteredFrom ?? []}
                          windFrom={e.stats.dir}
                          onToggle={place.shelter === 'parapeto' ? (deg) => {
                            const cur = place.shelteredFrom ?? []
                            setOverride(place.id, { shelteredFrom: cur.includes(deg) ? cur.filter((x) => x !== deg) : [...cur, deg] })
                          } : undefined}
                        />
                        <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
                          Esa noche sopla del <b style={{ color: 'var(--ink)' }}>{compass(e.stats.dir)}</b> a {Math.round(e.stats.windMean)} km/h (rachas {Math.round(e.stats.gustMax)}). {e.score.shelter.label[0].toUpperCase() + e.score.shelter.label.slice(1)}.
                          {place.shelter === 'parapeto' && <><br />Toca la rosa para marcar de qué vientos os resguarda.</>}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 rounded-3xl p-4" style={{ background: 'var(--surface)' }}>
                      {a ? (
                        <>
                          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-lg font-bold">
                            <span className="inline-flex items-center gap-1"><Car size={20} />{fmtDur(a.driveMin)}</span>+
                            <span className="inline-flex items-center gap-1"><Footprints size={20} />{fmtDur(a.walkMin)}</span>
                          </p>
                          <p className="mt-1 text-sm">{fmtDur(a.totalMin)} desde {ctx.prefs.homeName} ({fmtDur(a.driveMin)} en coche a {a.parking.name} + {fmtDur(a.walkMin)} andando, {a.walkKm.toFixed(1)} km)</p>
                          {e.access.length > 1 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {e.access.map((o) => (
                                <button key={o.parking.id} onClick={() => setPicked(o.parking.id)} className="tap rounded-full px-3 py-1 text-xs font-semibold" style={{ background: o.parking.id === a.parking.id ? 'var(--accent)' : 'var(--bg)', color: o.parking.id === a.parking.id ? '#fff' : 'var(--ink)' }}>
                                  {o.parking.name} · {fmtDur(o.totalMin)}
                                </button>
                              ))}
                            </div>
                          )}
                          {sunsetOk && (
                            <p className="mt-3 rounded-2xl p-3 text-sm font-semibold" style={{ background: 'var(--bg)' }}>
                              Sal de casa antes de las <b>{hhmm(e.leave!)}</b> para llegar con luz (puesta de sol {hhmm(e.night.sunset)}, con {ctx.prefs.marginMin} min de margen).
                            </p>
                          )}
                          {e.cost && <p className="mt-2 text-xs" style={{ color: 'var(--ink-soft)' }}>Gasolina ida y vuelta ≈ {e.cost.total.toFixed(1)} € ({e.cost.perPerson.toFixed(2)} € por persona entre {ctx.prefs.people}).{place.kind === 'refugio_pago' && ' Suma el precio del refugio (consultar) y recuerda reservar.'}</p>}
                          {isPass(a.parking) && ctx.wx && (() => {
                            const cell = ctx.wx.cells[cellKey(a.parking.lat, a.parking.lng)]
                            const day = cell?.hours.filter((h) => h.t >= days[dayIdx].getTime() - 6 * 3600000 && h.t <= days[dayIdx].getTime() + 18 * 3600000) ?? []
                            const snow = day.reduce((x, h) => x + h.snow, 0)
                            const risk = snow >= 0.5 || (day.some((h) => h.temp < 1) && day.reduce((x, h) => x + h.precip, 0) > 1)
                            return risk ? (
                              <p className="mt-3 flex items-start gap-2 rounded-2xl p-3 text-sm font-semibold" style={{ background: '#e5b23a33' }}>
                                <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                                <span>Posible nieve o hielo en el puerto: lleva cadenas y mira el estado en <a className="underline" href={DGT_URL} target="_blank" rel="noreferrer">la DGT <ExternalLink size={12} className="inline" /></a>.</span>
                              </p>
                            ) : <a className="mt-3 inline-flex items-center gap-1 text-xs underline" href={DGT_URL} target="_blank" rel="noreferrer">Estado de la carretera (DGT) <ExternalLink size={12} /></a>
                          })()}
                        </>
                      ) : <p className="text-sm">No hay aparcamiento conocido cerca. Usa «Cómo llegar» para ver la ruta.</p>}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
