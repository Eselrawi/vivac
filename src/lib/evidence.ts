import { useEffect, useState } from 'react'
import type { Photo } from './photos'
import type { Place } from './types'

export interface Evidence {
  c: 'confirmado' | 'probable' | 'sin confirmar'
  d: string
  e: Array<{ s: string; t: string; url?: string; weak?: boolean }>
  ph: Array<Photo & { own?: boolean }>
  m?: string
  n: number
}

let cache: Record<string, Evidence> | null = null
let loading: Promise<void> | null = null

export function useEvidence(p: Place | null): Evidence | null {
  const [, force] = useState(0)
  useEffect(() => {
    if (cache || loading) { loading?.then(() => force((n) => n + 1)); return }
    loading = fetch(`${import.meta.env.BASE_URL}data/evidence.json`).then((r) => r.json()).then((j) => { cache = j }).catch(() => { cache = {} })
    loading.then(() => force((n) => n + 1))
  }, [])
  return (p && cache?.[p.id]) || null
}

export const CONF_LABEL = { confirmado: 'Existe: confirmado por varias fuentes', probable: 'Probable: hay indicios', 'sin confirmar': 'Sin confirmar: solo un punto en el mapa' } as const
export const CONF_COLOR = { confirmado: '#3f8a68', probable: '#e5b23a', 'sin confirmar': '#8a8c8f' } as const
