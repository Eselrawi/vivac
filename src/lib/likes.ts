import { useEffect, useState, useSyncExternalStore } from 'react'
import { db } from './db'
import { getSb, GROUP_KEY } from './sb'

// «Me gusta» compartidos con el grupo (sustituyen a la lista de deseos). Funcionan sin conexión y se sincronizan al volver la red.
let mine = new Set<string>()
let others: Record<string, string[]> = {} // sitio → nombres de quien le ha dado
let size = 1
let version = 0
let started = false
const subs = new Set<() => void>()
const emit = () => { version++; subs.forEach((f) => f()) }

async function pull() {
  const gid = localStorage.getItem(GROUP_KEY)
  if (!gid || !navigator.onLine) return
  try {
    const sb = await getSb()
    const { data: sess } = await sb.auth.getSession()
    const uid = sess.session?.user.id
    const [{ data: likes }, { data: names }] = await Promise.all([sb.from('place_likes').select('place_ref,user_id'), sb.rpc('group_member_names', { gid })])
    const nm = new Map<string, string>((names ?? []).map((n: { user_id: string; name: string }) => [n.user_id, n.name]))
    size = Math.max(1, nm.size)
    const next: Record<string, string[]> = {}
    const remoteMine = new Set<string>()
    for (const l of likes ?? []) {
      if (l.user_id === uid) { remoteMine.add(l.place_ref); continue }
      ;(next[l.place_ref] ??= []).push(nm.get(l.user_id) ?? 'Alguien')
    }
    others = next
    // Lo mío local que aún no está en el servidor se sube; lo del servidor se suma a lo local.
    for (const id of mine) if (!remoteMine.has(id) && uid) await sb.from('place_likes').upsert({ group_id: gid, place_ref: id, user_id: uid }).then(() => {}, () => {})
    for (const id of remoteMine) mine.add(id)
    await db.kv.put({ k: 'likes', v: [...mine] })
    emit()
  } catch { /* sin red */ }
}

async function start() {
  if (started) return
  started = true
  mine = new Set(((await db.kv.get('likes'))?.v as string[]) ?? [])
  emit()
  void pull()
  window.addEventListener('online', () => void pull())
}

export async function toggleLike(id: string) {
  const on = !mine.has(id)
  if (on) mine.add(id); else mine.delete(id)
  await db.kv.put({ k: 'likes', v: [...mine] })
  emit()
  const gid = localStorage.getItem(GROUP_KEY)
  if (gid && navigator.onLine) {
    try {
      const sb = await getSb()
      const { data: sess } = await sb.auth.getSession()
      const uid = sess.session?.user.id
      if (!uid) return
      if (on) await sb.from('place_likes').upsert({ group_id: gid, place_ref: id, user_id: uid })
      else await sb.from('place_likes').delete().eq('place_ref', id).eq('user_id', uid)
    } catch { /* se subirá luego */ }
  }
}

export function useLikes() {
  useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb) }, () => version)
  const [, force] = useState(0)
  useEffect(() => { void start().then(() => force((n) => n + 1)) }, [])
  const who = (id: string) => [...(mine.has(id) ? ['Tú'] : []), ...(others[id] ?? [])]
  /** Fracción del grupo a la que le gusta el sitio (0–1). */
  const fraction = (id: string) => who(id).length / Math.max(size, 1, who(id).length)
  const likedIds = () => new Set([...mine, ...Object.keys(others)])
  return { mine, who, fraction, likedIds, toggle: toggleLike, groupSize: size, version }
}
