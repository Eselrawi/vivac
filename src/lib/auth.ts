import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getSb, GROUP_KEY, JOIN_KEY } from './sb'
import { syncNow } from './sync'

export interface GroupInfo { id: string; name: string; invite_code: string }

// Si llegas desde un enlace de invitación (?join=CODIGO) lo guardamos hasta iniciar sesión.
const q = new URLSearchParams(location.search).get('join')
if (q) {
  localStorage.setItem(JOIN_KEY, q)
  history.replaceState(null, '', location.pathname)
}

/** ¿Venimos de un enlace mágico? Entonces Supabase debe procesarlo ya. */
const comingFromMagicLink = /access_token|refresh_token|code=/.test(location.hash + location.search)

export function useAccount() {
  const [session, setSession] = useState<Session | null>(null)
  const [group, setGroup] = useState<GroupInfo | null>(null)
  const [ready, setReady] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const loadGroup = useCallback(async () => {
    const sb = await getSb()
    const { data: s } = await sb.auth.getSession()
    if (!s.session) { setGroup(null); return }
    const code = localStorage.getItem(JOIN_KEY)
    if (code) {
      const { error } = await sb.rpc('join_group', { code })
      if (!error) localStorage.removeItem(JOIN_KEY)
    }
    const { data } = await sb.from('groups').select('id,name,invite_code').limit(1)
    const g = (data?.[0] as GroupInfo | undefined) ?? null
    setGroup(g)
    if (g) localStorage.setItem(GROUP_KEY, g.id)
  }, [])

  useEffect(() => {
    let off: (() => void) | undefined
    let dead = false
    const start = async () => {
      const sb = await getSb()
      if (dead) return
      const { data } = await sb.auth.getSession()
      setSession(data.session); setReady(true)
      const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setSession(s))
      off = () => sub.subscription.unsubscribe()
    }
    const t = setTimeout(start, comingFromMagicLink || localStorage.getItem(JOIN_KEY) ? 0 : 2500)
    return () => { dead = true; clearTimeout(t); off?.() }
  }, [])

  useEffect(() => { if (session) void loadGroup(); else setGroup(null) }, [session, loadGroup])

  const sync = useCallback(async () => {
    if (!group) return
    setSyncing(true)
    try { await syncNow(group.id) } finally { setSyncing(false) }
  }, [group])

  useEffect(() => {
    if (!group) return
    void sync()
    window.addEventListener('online', sync)
    return () => window.removeEventListener('online', sync)
  }, [group, sync])

  return { session, group, ready, syncing, sync, reloadGroup: loadGroup }
}
