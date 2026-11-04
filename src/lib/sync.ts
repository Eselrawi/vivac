import { db } from './db'
import { supabase } from './supabase'

let running = false

/** Sube a Supabase los vivacs guardados en el móvil. Seguro llamarla muchas veces. */
export async function syncNow(groupId: string): Promise<number> {
  if (running || !navigator.onLine) return 0
  running = true
  let n = 0
  try {
    const { data: s } = await supabase.auth.getSession()
    const uid = s.session?.user.id
    if (!uid) return 0
    const pending = await db.vivacs.where('synced').equals(0).toArray()
    for (const r of pending) {
      let photo_path: string | null = null
      if (r.photo) {
        photo_path = `${groupId}/${r.id}.webp`
        const up = await supabase.storage.from('photos').upload(photo_path, r.photo, { contentType: 'image/webp', upsert: true })
        if (up.error) continue
      }
      const { error } = await supabase.from('vivacs').upsert({
        id: r.id,
        group_id: groupId,
        name: r.name,
        geom: `SRID=4326;POINT(${r.lng} ${r.lat})`,
        ele: r.ele != null ? Math.round(r.ele) : null,
        slept_at: new Date(r.at).toISOString(),
        sleep_rating: r.sleep ?? null,
        notes: r.notes ?? null,
        photo_path,
        created_by: uid,
      })
      if (!error) {
        await db.vivacs.update(r.id, { synced: 1 })
        n++
      }
    }
  } finally {
    running = false
  }
  return n
}
