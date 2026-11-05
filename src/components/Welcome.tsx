import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { MapPin, Share, SquarePlus, Users } from 'lucide-react'
import { canPromptInstall, detectPlatform, isStandalone, promptInstall } from '../lib/platform'

import { WELCOME_KEY } from '../lib/platform'

export function InstallSteps() {
  const p = detectPlatform()
  const installed = isStandalone()
  const [, force] = useState(0)
  if (installed) return <p className="rounded-2xl p-4 font-semibold" style={{ background: 'var(--surface)' }}>✅ Ya la tienes instalada. Todo listo.</p>
  if (p === 'ios')
    return (
      <ol className="flex flex-col gap-3 text-left">
        <li className="flex items-center gap-3 rounded-2xl p-4" style={{ background: 'var(--surface)' }}><Share className="shrink-0" /><span>Abre esta página en <b>Safari</b> y pulsa el botón <b>Compartir</b> (el cuadrado con la flecha hacia arriba).</span></li>
        <li className="flex items-center gap-3 rounded-2xl p-4" style={{ background: 'var(--surface)' }}><SquarePlus className="shrink-0" /><span>Elige <b>«Añadir a pantalla de inicio»</b> y pulsa <b>Añadir</b>.</span></li>
        <li className="rounded-2xl p-3 text-sm" style={{ color: 'var(--ink-soft)' }}>En iPhone, los avisos solo funcionan con la app instalada (iOS 16.4 o más) y no vibra. Es cosa de Apple.</li>
      </ol>
    )
  return (
    <div className="flex flex-col gap-3 text-left">
      {canPromptInstall() && (
        <button onClick={async () => { await promptInstall(); force((n) => n + 1) }} className="tap rounded-2xl py-4 text-lg font-bold text-white" style={{ background: 'var(--accent)' }}>Instalar la app</button>
      )}
      <p className="rounded-2xl p-4" style={{ background: 'var(--surface)' }}>
        {p === 'android' ? <>En Chrome, pulsa los <b>tres puntos ⋮</b> de arriba y elige <b>«Instalar aplicación»</b> (o «Añadir a la pantalla de inicio»).</> : <>En el navegador, busca el icono de <b>instalar</b> en la barra de direcciones, o el menú → «Instalar Vivac».</>}
      </p>
    </div>
  )
}

export default function Welcome({ onDone, onJoin }: { onDone: () => void; onJoin: () => void }) {
  const [i, setI] = useState(0)
  const [geo, setGeo] = useState<'idle' | 'ok' | 'no'>('idle')
  const last = i === 2
  const next = () => (last ? (localStorage.setItem(WELCOME_KEY, '1'), onDone()) : setI(i + 1))

  const slides = [
    { Icon: null, title: 'Vivac en tu bolsillo', text: 'Para dormir en la sierra cada finde. Funciona sin cobertura. Instálala para tenerla siempre a mano.', body: <InstallSteps /> },
    { Icon: MapPin, title: 'Tu ubicación', text: 'Con ella te marco en el mapa, relleno al instante dónde dormís y te saco de apuros si hace falta. Solo se usa mientras tienes la app abierta.', body: (
      <button onClick={() => navigator.geolocation.getCurrentPosition(() => setGeo('ok'), () => setGeo('no'), { enableHighAccuracy: true })} className="tap w-full rounded-2xl py-4 text-lg font-bold text-white" style={{ background: geo === 'ok' ? '#3f8a68' : 'var(--accent)' }}>
        {geo === 'ok' ? '✓ Ubicación permitida' : geo === 'no' ? 'No se pudo. Puedes activarla luego en Ajustes' : 'Permitir ubicación'}
      </button>) },
    { Icon: Users, title: 'Tu grupo', text: 'Entra con tu correo y únete con el enlace que te pasen, o crea el grupo y manda tú la invitación. También puedes hacerlo luego.', body: (
      <button onClick={() => { localStorage.setItem(WELCOME_KEY, '1'); onDone(); onJoin() }} className="tap w-full rounded-2xl py-4 text-lg font-bold text-white" style={{ background: 'var(--accent)' }}>Entrar o unirme a un grupo</button>) },
  ]
  const s = slides[i]

  return (
    <div className="fixed inset-x-0 top-0 z-[100] flex flex-col px-6" style={{ height: '100dvh', background: 'var(--bg)', paddingTop: 'calc(var(--safe-t) + 16px)', paddingBottom: 'calc(var(--safe-b) + 16px)' }}>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <AnimatePresence mode="wait">
        <motion.div key={i} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.25 }} className="mx-auto flex w-full max-w-md flex-1 flex-col items-center text-center">
          {s.Icon ? <div className="mt-6 grid h-24 w-24 place-items-center rounded-3xl text-white" style={{ background: 'var(--accent)' }}><s.Icon size={44} /></div> : <img src={`${import.meta.env.BASE_URL}icon-192.png`} alt="" width={96} height={96} className="mt-6 rounded-3xl shadow-xl" />}
          <h1 className="mt-6 text-3xl font-semibold">{s.title}</h1>
          <p className="mt-3" style={{ color: 'var(--ink-soft)' }}>{s.text}</p>
          <div className="mt-6 w-full">{s.body}</div>
        </motion.div>
      </AnimatePresence>
      </div>
      <div className="mx-auto mt-3 w-full max-w-md shrink-0">
        <div className="mb-4 flex justify-center gap-2" aria-hidden>{[0, 1, 2].map((n) => <i key={n} className="h-2 rounded-full transition-all" style={{ width: n === i ? 24 : 8, background: n === i ? 'var(--accent)' : 'var(--line)' }} />)}</div>
        <button onClick={next} className="tap w-full rounded-2xl py-4 text-lg font-bold" style={{ background: 'var(--surface)' }}>{last ? 'Empezar' : 'Siguiente'}</button>
        {!last && <button onClick={() => { localStorage.setItem(WELCOME_KEY, '1'); onDone() }} className="tap mt-2 w-full text-sm" style={{ color: 'var(--ink-soft)' }}>Saltar</button>}
      </div>
    </div>
  )
}
