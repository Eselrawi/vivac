import { useEffect, useState } from 'react'
import { db } from './db'
import type { Place } from './types'

export interface Photo { url: string; page: string; author: string; license: string; title: string }

const strip = (h?: string) => (h ?? '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').trim()

/** Fotos de Wikimedia Commons cerca del punto, con autor y licencia. */
async function commons(p: Place): Promise<Photo[]> {
  const qs = new URLSearchParams({
    action: 'query', generator: 'geosearch', ggscoord: `${p.lat}|${p.lng}`, ggsradius: '250', ggsnamespace: '6', ggslimit: '6',
    prop: 'imageinfo', iiprop: 'url|extmetadata|mime', iiurlwidth: '900', format: 'json', origin: '*',
  })
  const r = await fetch(`https://commons.wikimedia.org/w/api.php?${qs}`)
  if (!r.ok) return []
  const j = await r.json()
  const pages = Object.values(j.query?.pages ?? {}) as Array<{ title: string; imageinfo?: Array<{ thumburl?: string; url: string; mime: string; descriptionurl: string; extmetadata?: Record<string, { value: string }> }> }>
  return pages
    .map((pg) => ({ pg, i: pg.imageinfo?.[0] }))
    .filter((x) => x.i && /^image\/(jpeg|png|webp)/.test(x.i.mime))
    .map(({ pg, i }) => ({
      url: i!.thumburl ?? i!.url, page: i!.descriptionurl, title: pg.title.replace(/^File:/, ''),
      author: strip(i!.extmetadata?.Artist?.value) || 'Autor desconocido', license: strip(i!.extmetadata?.LicenseShortName?.value) || 'Ver licencia',
    }))
}

export function usePhotos(p: Place | null): Photo[] {
  const [ph, setPh] = useState<Photo[]>([])
  useEffect(() => {
    setPh([])
    if (!p || p.kind === 'cumbre') return
    let alive = true
    const key = `photos:${p.id}`
    db.kv.get(key).then(async (row) => {
      const cached = row?.v as { at: number; items: Photo[] } | undefined
      if (cached && alive) setPh(cached.items)
      if (cached && Date.now() - cached.at < 30 * 86400000) return
      if (!navigator.onLine) return
      try {
        const items = await commons(p)
        await db.kv.put({ k: key, v: { at: Date.now(), items } })
        if (alive) setPh(items)
      } catch { /* sin red */ }
    })
    return () => { alive = false }
  }, [p?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  return ph
}
