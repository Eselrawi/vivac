import { useRef, useState } from 'react'
import { Drawer } from 'vaul'
import { Copy, Download, LogOut, Mail, Trash2, Upload, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { useAccount } from '../lib/auth'
import { db } from '../lib/db'
import { download, parseAny, toGeoJson, toGpx } from '../lib/gpx'
import { setPrefs, usePrefs } from '../lib/prefs'
import { InstallSteps } from './Welcome'

type Acc = ReturnType<typeof useAccount>
const input = 'tap w-full rounded-2xl border px-4 text-lg'
const inputStyle = { background: 'var(--surface)', borderColor: 'var(--line)', userSelect: 'text' as const }
const primary = 'tap w-full rounded-2xl py-3 text-lg font-bold text-white disabled:opacity-40'
const card = { background: 'var(--surface)' }

const H = ({ children }: { children: React.ReactNode }) => <h3 className="mt-6 text-lg font-semibold">{children}</h3>

function Slider({ label, value, min, max, step = 1, unit, onChange }: { label: string; value: number; min: number; max: number; step?: number; unit: string; onChange: (v: number) => void }) {
  return (
    <label className="block rounded-2xl p-3" style={card}>
      <span className="flex justify-between text-sm font-semibold"><span>{label}</span><span>{value} {unit}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-2 w-full" style={{ accentColor: 'var(--accent)' }} />
    </label>
  )
}

export default function ProfileSheet({ open, onClose, acc, onWelcome }: { open: boolean; onClose: () => void; acc: Acc; onWelcome: () => void }) {
  const prefs = usePrefs()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [gname, setGname] = useState('')
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState('')
  const [cn, setCn] = useState('')
  const [cp, setCp] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const { session, group } = acc
  const link = group ? `${location.origin}${import.meta.env.BASE_URL}?join=${group.invite_code}` : ''

  const sendLink = async () => {
    setMsg('')
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + import.meta.env.BASE_URL } })
    if (error) setMsg('No he podido enviarlo. Revisa el correo.')
    else setSent(true)
  }
  const create = async () => { const { error } = await supabase.rpc('create_group', { gname }); if (error) setMsg(error.message); else await acc.reloadGroup() }
  const join = async () => { const { error } = await supabase.rpc('join_group', { code: code.trim() }); if (error) setMsg('Ese código no vale.'); else await acc.reloadGroup() }
  const share = async () => {
    const text = `Únete a nuestro grupo de vivacs: ${link}`
    if (navigator.share) await navigator.share({ title: 'Vivac', text }).catch(() => {})
    else await navigator.clipboard.writeText(link)
  }
  const importFile = async (f: File) => {
    try {
      const { waypoints, tracks } = parseAny(f.name, await f.text())
      for (const w of waypoints) await db.vivacs.add({ id: crypto.randomUUID(), name: w.name, kind: 'deseo', lat: w.lat, lng: w.lng, ele: w.ele ?? null, at: Date.now(), synced: 0 })
      for (const t of tracks) await db.tracks.add({ id: crypto.randomUUID(), name: t.name, coords: t.coords, at: Date.now(), source: 'import' })
      setMsg(`Importado: ${waypoints.length} puntos y ${tracks.length} tracks.`)
    } catch (e) { setMsg((e as Error).message) }
  }
  const exportAll = async (kind: 'gpx' | 'json') => {
    const v = await db.vivacs.toArray(); const t = await db.tracks.toArray()
    if (kind === 'gpx') download('vivac.gpx', 'application/gpx+xml', toGpx(v, t))
    else download('vivac.geojson', 'application/geo+json', toGeoJson(v, t))
  }

  const seg = (cur: string, opts: [string, string][], on: (v: string) => void) => (
    <div className="grid gap-1 rounded-2xl p-1" style={{ ...card, gridTemplateColumns: `repeat(${opts.length}, 1fr)` }}>
      {opts.map(([v, l]) => <button key={v} aria-pressed={cur === v} onClick={() => on(v)} className="tap rounded-xl text-sm font-semibold" style={{ background: cur === v ? 'var(--accent)' : 'transparent', color: cur === v ? '#fff' : 'var(--ink)' }}>{l}</button>)}
    </div>
  )

  return (
    <Drawer.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[60] bg-black/40" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 mx-auto max-w-xl z-[70] max-h-[92%] overflow-y-auto rounded-t-3xl p-5 pb-10 outline-none" style={{ background: 'var(--bg)' }}>
          <Drawer.Handle />
          <Drawer.Title className="font-display mt-3 text-2xl font-semibold">Perfil</Drawer.Title>
          <Drawer.Description className="sr-only">Cuenta, grupo y ajustes</Drawer.Description>
          <div className="mt-4 flex flex-col gap-3">
            {!session ? (
              sent ? (
                <p className="rounded-2xl p-4" style={card}>📬 Te he mandado un enlace a <b>{email}</b>. Ábrelo desde este móvil y listo. No hay contraseña.</p>
              ) : (
                <>
                  <p style={{ color: 'var(--ink-soft)' }}>Entra con tu correo. Te llegará un enlace, sin contraseñas.</p>
                  <input className={input} style={inputStyle} type="email" inputMode="email" placeholder="tu@correo.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                  <button className={primary} style={{ background: 'var(--accent)' }} disabled={!email.includes('@')} onClick={sendLink}><Mail className="mr-2 inline" size={20} />Enviarme el enlace</button>
                </>
              )
            ) : !group ? (
              <>
                <p style={{ color: 'var(--ink-soft)' }}>Sesión iniciada como <b>{session.user.email}</b>. Ahora, ¿tu grupo?</p>
                <input className={input} style={inputStyle} placeholder="Código de invitación" value={code} onChange={(e) => setCode(e.target.value)} />
                <button className={primary} style={{ background: 'var(--accent)' }} disabled={!code.trim()} onClick={join}>Unirme a un grupo</button>
                <p className="text-center text-sm" style={{ color: 'var(--ink-soft)' }}>o crea uno nuevo</p>
                <input className={input} style={inputStyle} placeholder="Nombre del grupo" value={gname} onChange={(e) => setGname(e.target.value)} />
                <button className={primary} style={{ background: '#1b2c44' }} disabled={!gname.trim()} onClick={create}>Crear grupo</button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 rounded-2xl p-4" style={card}><Users /><div><b className="block">{group.name}</b><span className="text-sm" style={{ color: 'var(--ink-soft)' }}>{session.user.email}</span></div></div>
                <button className={primary} style={{ background: 'var(--accent)' }} onClick={share}><Copy className="mr-2 inline" size={20} />Invitar a un amigo</button>
                <button className="tap w-full rounded-2xl py-3 font-semibold" style={card} onClick={acc.sync}>{acc.syncing ? 'Sincronizando…' : 'Sincronizar ahora'}</button>
                <button className="tap w-full rounded-2xl py-3 font-semibold" style={card} onClick={() => supabase.auth.signOut()}><LogOut className="mr-2 inline" size={18} />Cerrar sesión</button>
              </>
            )}
            {msg && <p className="text-sm" style={{ color: 'var(--color-mal)' }}>{msg}</p>}
          </div>

          <H>Apariencia</H>
          <div className="mt-2">{seg(prefs.theme, [['auto', 'Auto'], ['claro', 'Claro'], ['oscuro', 'Oscuro'], ['rojo', 'Noche rojo']], (v) => setPrefs({ theme: v as never }))}</div>
          <p className="mt-1 text-xs" style={{ color: 'var(--ink-soft)' }}>«Noche rojo» cuida la vista cuando ya es de noche en el monte.</p>
          <div className="mt-2">{seg(prefs.units, [['m', 'Metros'], ['ft', 'Pies']], (v) => setPrefs({ units: v as never }))}</div>

          <H>Casa y salidas</H>
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>Todas las salidas parten de <b>{prefs.homeName}</b>.</p>
          <div className="mt-2 flex flex-col gap-2">
            <Slider label="Margen para montar y cenar con luz" value={prefs.marginMin} min={0} max={150} step={10} unit="min" onChange={(v) => setPrefs({ marginMin: v })} />
            <Slider label="Consumo del coche" value={prefs.consumption} min={4} max={14} step={0.5} unit="l/100 km" onChange={(v) => setPrefs({ consumption: v })} />
            <Slider label="Precio de la gasolina" value={prefs.fuelPrice} min={1} max={2.4} step={0.05} unit="€/l" onChange={(v) => setPrefs({ fuelPrice: Number(v.toFixed(2)) })} />
            <Slider label="Personas por coche" value={prefs.people} min={1} max={6} unit="" onChange={(v) => setPrefs({ people: v })} />
            <button className="tap rounded-2xl py-3 text-sm font-semibold" style={card} onClick={() => navigator.geolocation.getCurrentPosition((p) => setPrefs({ homeLat: p.coords.latitude, homeLng: p.coords.longitude, homeName: 'Mi ubicación' }), () => setMsg('No he podido leer tu ubicación'))}>Cambiar casa a mi ubicación actual</button>
            {prefs.homeName !== 'Villanueva de la Cañada' && <button className="tap rounded-2xl py-3 text-sm font-semibold" style={card} onClick={() => setPrefs({ homeName: 'Villanueva de la Cañada', homeLat: 40.4436, homeLng: -3.9944 })}>Volver a Villanueva de la Cañada</button>}
          </div>

          <H>Contactos de emergencia</H>
          <ul className="mt-2 flex flex-col gap-2">
            {prefs.contacts.map((c, i) => (
              <li key={i} className="flex items-center justify-between rounded-2xl p-3" style={card}><span><b>{c.name}</b> · {c.phone}</span><button aria-label="Borrar contacto" className="tap grid h-10 w-10 place-items-center" onClick={() => setPrefs({ contacts: prefs.contacts.filter((_, j) => j !== i) })}><Trash2 size={16} /></button></li>
            ))}
          </ul>
          <div className="mt-2 grid grid-cols-[1fr_1fr_auto] gap-2">
            <input className="tap min-w-0 rounded-2xl border px-3" style={inputStyle} placeholder="Nombre" value={cn} onChange={(e) => setCn(e.target.value)} />
            <input className="tap min-w-0 rounded-2xl border px-3" style={inputStyle} inputMode="tel" placeholder="Teléfono" value={cp} onChange={(e) => setCp(e.target.value)} />
            <button className="tap rounded-2xl px-4 font-bold text-white disabled:opacity-40" style={{ background: 'var(--accent)' }} disabled={!cn.trim() || !cp.trim()} onClick={() => { setPrefs({ contacts: [...prefs.contacts, { name: cn.trim(), phone: cp.trim() }] }); setCn(''); setCp('') }}>+</button>
          </div>

          <H>Tus datos</H>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button className="tap flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold" style={card} onClick={() => exportAll('gpx')}><Download size={16} />Exportar GPX</button>
            <button className="tap flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold" style={card} onClick={() => exportAll('json')}><Download size={16} />Exportar GeoJSON</button>
            <button className="tap col-span-2 flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold" style={card} onClick={() => file.current?.click()}><Upload size={16} />Importar GPX, KML o GeoJSON (de Wikiloc…)</button>
            <input ref={file} type="file" accept=".gpx,.kml,.geojson,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = '' }} />
          </div>

          <H>Avisos</H>
          <button className="tap mt-2 w-full rounded-2xl py-3 text-sm font-semibold" style={card} onClick={async () => { if (!('Notification' in window)) return setMsg('Este móvil no admite avisos. En iPhone, instala primero la app.'); const r = await Notification.requestPermission(); setMsg(r === 'granted' ? 'Avisos activados: te recordaré valorar cada noche.' : 'Avisos desactivados.') }}>Activar el aviso «¿qué tal durmieron?»</button>
          <p className="mt-1 text-xs" style={{ color: 'var(--ink-soft)' }}>El aviso sale al abrir la app al día siguiente. En iPhone solo funciona con la app instalada (iOS 16.4 o más).</p>

          <H>Instalar la app</H>
          <div className="mt-2"><InstallSteps /></div>
          <button className="tap mt-2 w-full rounded-2xl py-3 text-sm font-semibold" style={card} onClick={() => { onClose(); onWelcome() }}>Ver la bienvenida otra vez</button>

          <H>Legal y fuentes</H>
          <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
            Mapas © IGN España (MTN, PNOA) · relieve: Terrain Tiles de AWS · refugios, fuentes y cumbres: © colaboradores de OpenStreetMap (ODbL) · tiempos en coche: OSRM · previsión: Open-Meteo (CC BY 4.0). La acampada y el vivac están regulados en el Parque Nacional de la Sierra de Guadarrama: consulta las zonas autorizadas en datos.gob.es antes de salir. Los datos de refugios y parapetos están sin verificar: confirma sobre el terreno y con el parte oficial. La montaña es peligrosa: esta app orienta, no sustituye al criterio ni a la previsión oficial (AEMET).
          </p>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
