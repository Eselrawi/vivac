import { useState } from 'react'
import { Drawer } from 'vaul'
import { Copy, LogOut, Mail, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { useAccount } from '../lib/auth'

type Acc = ReturnType<typeof useAccount>
const input = 'tap w-full rounded-2xl border px-4 text-lg'
const inputStyle = { background: 'var(--surface)', borderColor: 'var(--line)', userSelect: 'text' as const }
const primary = 'tap w-full rounded-2xl py-3 text-lg font-bold text-white disabled:opacity-40'

export default function ProfileSheet({ open, onClose, acc }: { open: boolean; onClose: () => void; acc: Acc }) {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [gname, setGname] = useState('')
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState('')
  const { session, group } = acc

  const link = group ? `${location.origin}${import.meta.env.BASE_URL}?join=${group.invite_code}` : ''

  const sendLink = async () => {
    setMsg('')
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + import.meta.env.BASE_URL } })
    if (error) setMsg('No he podido enviarlo. Revisa el correo.')
    else setSent(true)
  }
  const create = async () => {
    const { error } = await supabase.rpc('create_group', { gname })
    if (error) setMsg(error.message)
    else await acc.reloadGroup()
  }
  const join = async () => {
    const { error } = await supabase.rpc('join_group', { code: code.trim() })
    if (error) setMsg('Ese código no vale.')
    else await acc.reloadGroup()
  }
  const share = async () => {
    const text = `Únete a nuestro grupo de vivacs: ${link}`
    if (navigator.share) await navigator.share({ title: 'Vivac', text }).catch(() => {})
    else await navigator.clipboard.writeText(link)
  }

  return (
    <Drawer.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[60] bg-black/40" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-[70] max-h-[92%] overflow-y-auto rounded-t-3xl p-5 pb-8" style={{ background: 'var(--bg)' }}>
          <Drawer.Handle />
          <Drawer.Title className="font-display mt-3 text-2xl font-semibold">Perfil</Drawer.Title>
          <Drawer.Description className="sr-only">Cuenta y grupo</Drawer.Description>
          <div className="mt-4 flex flex-col gap-4">
            {!session ? (
              sent ? (
                <p className="rounded-2xl p-4" style={{ background: 'var(--surface)' }}>📬 Te he mandado un enlace a <b>{email}</b>. Ábrelo desde este móvil y listo. No hay contraseña.</p>
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
                <div className="flex items-center gap-3 rounded-2xl p-4" style={{ background: 'var(--surface)' }}>
                  <Users />
                  <div><b className="block">{group.name}</b><span className="text-sm" style={{ color: 'var(--ink-soft)' }}>{session.user.email}</span></div>
                </div>
                <button className={primary} style={{ background: 'var(--accent)' }} onClick={share}><Copy className="mr-2 inline" size={20} />Invitar a un amigo</button>
                <button className="tap w-full rounded-2xl py-3 font-semibold" style={{ background: 'var(--surface)' }} onClick={acc.sync}>{acc.syncing ? 'Sincronizando…' : 'Sincronizar ahora'}</button>
                <button className="tap w-full rounded-2xl py-3 font-semibold" style={{ background: 'var(--surface)' }} onClick={() => supabase.auth.signOut()}><LogOut className="mr-2 inline" size={18} />Cerrar sesión</button>
              </>
            )}
            {msg && <p className="text-sm" style={{ color: 'var(--color-mal)' }}>{msg}</p>}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
