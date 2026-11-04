import Dexie, { liveQuery, type Table } from 'dexie'
import { useEffect, useState } from 'react'
import type { Place } from './types'
import type { GearItem } from './pack'

export interface TrackRecord { id: string; name: string; coords: [number, number, number?][]; at: number; source: 'import' | 'rec'; vivacId?: string }

export interface NightWx { tmin: number; tmax: number; windMax: number; precip: number; cloud: number; src: 'real' | 'previsión' }

export interface VivacRecord {
  id: string
  name: string
  kind: 'vivac' | 'deseo' | 'refugio_libre' | 'parapeto' | 'abrigo' | 'fuente'
  shelter?: Place['shelter']
  shelteredFrom?: number[]
  capacity?: number | null
  lat: number
  lng: number
  ele?: number | null
  at: number
  photo?: Blob | null
  sleep?: 1 | 2 | 3 | null // 1 frío, 2 bien, 3 calor
  notes?: string
  photoPath?: string | null
  by?: string
  wx?: NightWx | null
  synced: 0 | 1
}

class VivacDB extends Dexie {
  vivacs!: Table<VivacRecord, string>
  tracks!: Table<TrackRecord, string>
  gear!: Table<GearItem, string>
  kv!: Table<{ k: string; v: unknown }, string>
  constructor() {
    super('vivac')
    this.version(1).stores({ vivacs: 'id, at, synced, kind' })
    this.version(2).stores({ vivacs: 'id, at, synced, kind', kv: 'k' })
    this.version(3).stores({ vivacs: 'id, at, synced, kind', kv: 'k', gear: 'id, cat' })
    this.version(4).stores({ vivacs: 'id, at, synced, kind', kv: 'k', gear: 'id, cat', tracks: 'id, at' })
  }
}

export const db = new VivacDB()

export async function saveVivac(r: Omit<VivacRecord, 'id' | 'at' | 'synced'>) {
  const rec: VivacRecord = { ...r, id: crypto.randomUUID(), at: Date.now(), synced: 0 }
  await db.vivacs.add(rec)
  return rec
}

export function useLive<T>(q: () => Promise<T>, initial: T): T {
  const [v, setV] = useState<T>(initial)
  useEffect(() => {
    const s = liveQuery(q).subscribe({ next: setV })
    return () => s.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return v
}

export const recordToPlace = (r: VivacRecord): Place => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  lat: r.lat,
  lng: r.lng,
  ele: r.ele ?? undefined,
  verified: true,
  source: 'grupo',
  shelter: r.shelter,
  shelteredFrom: r.shelteredFrom,
  capacity: r.capacity ? String(r.capacity) : undefined,
  visited: r.kind === 'vivac' ? 1 : undefined,
})

/** Comprime una foto a WebP (máx. 1280 px) en el propio móvil. */
export async function compressPhoto(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const k = Math.min(1, 1280 / Math.max(bmp.width, bmp.height))
  const c = new OffscreenCanvas(Math.round(bmp.width * k), Math.round(bmp.height * k))
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  return c.convertToBlob({ type: 'image/webp', quality: 0.8 })
}

export async function askPersistent() {
  try { await navigator.storage?.persist?.() } catch { /* iOS puede negarlo */ }
}
