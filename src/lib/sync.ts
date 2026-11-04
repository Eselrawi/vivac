import { db } from './db'
import { supabase } from './supabase'

let running = false

/** Descarga los vivacs del grupo que aún no están en este móvil. */
export async function pullGroup(): Promise<number> {
  if (!navigator.onLine) return 0
  const { data } = await supabase.from('vivacs').select('id,name,lat,lng,ele,slept_at,sleep_rating,notes,photo_path,created_by,weather')
  let n = 0
  for (const v of data ?? []) {
    const have = await db.vivacs.get(v.id)
    if (have) { if (have.synced === 1 && !have.wx && v.weather) await db.vivacs.update(v.id, { wx: v.weather }); continue }
    await db.vivacs.add({ id: v.id, name: v.name, kind: 'vivac', lat: v.lat, lng: v.lng, ele: v.ele, at: new Date(v.slept_at).getTime(), sleep: v.sleep_rating, notes: v.notes ?? undefined, photoPath: v.photo_path, by: v.created_by, wx: v.weather, synced: 1 })
    n++
  }
  const { data: pl } = await supabase.from('places').select('id,name,kind,lat,lng,ele,shelter,props,created_by').not('group_id', 'is', null)
  for (const p of pl ?? []) {
    if (await db.vivacs.get(p.id)) continue
    await db.vivacs.add({ id: p.id, name: p.name, kind: p.kind, lat: p.lat, lng: p.lng, ele: p.ele, at: Date.now(), shelter: p.shelter ?? undefined, shelteredFrom: p.props?.shelteredFrom, capacity: p.props?.capacity ?? null, by: p.created_by, synced: 1 })
    n++
  }
  return n
}

/** Sube a Supabase los vivacs guardados en el móvil. Seguro llamarla muchas veces. */
export async function syncNow(groupId: string): Promise<number> {
  if (running || !navigator.onLine) return 0
  running = true
  let n = 0
  try {
    const { data: s } = await supabase.auth.getSession()
    const uid = s.session?.user.id
    if (!uid) return 0
    await pullGroup()
    const pending = await db.vivacs.where('synced').equals(0).toArray()
    for (const r of pending) {
      let photo_path: string | null = null
      if (r.photo) {
        photo_path = `${groupId}/${r.id}.webp`
        const up = await supabase.storage.from('photos').upload(photo_path, r.photo, { contentType: 'image/webp', upsert: true })
        if (up.error) continue
      }
      if (r.kind !== 'vivac') {
        const { error: e2 } = await supabase.from('places').upsert({ id: r.id, group_id: groupId, kind: r.kind, name: r.name, geom: `SRID=4326;POINT(${r.lng} ${r.lat})`, ele: r.ele != null ? Math.round(r.ele) : null, shelter: r.shelter ?? null, props: { shelteredFrom: r.shelteredFrom ?? [], capacity: r.capacity ?? null }, verified: false, source: 'grupo', created_by: uid })
        if (!e2) { await db.vivacs.update(r.id, { synced: 1 }); n++ }
        continue
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
        photo_path: photo_path ?? r.photoPath ?? null,
        weather: r.wx ?? null,
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
