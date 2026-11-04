// Descarga de zonas del mapa para usarlas sin cobertura (Cache Storage, el mismo que lee el service worker).
export type LayerId = 'ign' | 'mtn' | 'pnoa' | 'dem'
export interface Bounds { w: number; s: number; e: number; n: number }
export const SIERRA: Bounds = { w: -4.45, s: 40.55, e: -3.65, n: 41.05 }
export const CACHE_NAME = 'tiles'

const wmts = (layer: string, server: string, z: number, x: number, y: number) =>
  `https://www.ign.es/wmts/${server}?service=WMTS&request=GetTile&version=1.0.0&layer=${layer}&style=default&tilematrixset=GoogleMapsCompatible&format=image/jpeg&tilematrix=${z}&tilerow=${y}&tilecol=${x}`

export const LAYERS: Record<LayerId, { label: string; maxZoom: number; kb: number; url: (z: number, x: number, y: number) => string }> = {
  ign: { label: 'Mapa base', maxZoom: 19, kb: 22, url: (z, x, y) => wmts('IGNBaseTodo', 'ign-base', z, x, y) },
  mtn: { label: 'Topográfico', maxZoom: 17, kb: 38, url: (z, x, y) => wmts('MTN', 'mapa-raster', z, x, y) },
  pnoa: { label: 'Satélite', maxZoom: 19, kb: 30, url: (z, x, y) => wmts('OI.OrthoimageCoverage', 'pnoa-ma', z, x, y) },
  dem: { label: 'Relieve 3D', maxZoom: 14, kb: 28, url: (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png` },
}

const lng2x = (lng: number, z: number) => Math.floor(((lng + 180) / 360) * 2 ** z)
const lat2y = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z)
}

export function tilesFor(b: Bounds, layers: LayerId[], zMin: number, zMax: number) {
  const out: { url: string; kb: number }[] = []
  for (const l of layers) {
    const L = LAYERS[l]
    for (let z = zMin; z <= Math.min(zMax, L.maxZoom); z++) {
      const x0 = lng2x(b.w, z), x1 = lng2x(b.e, z), y0 = lat2y(b.n, z), y1 = lat2y(b.s, z)
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push({ url: L.url(z, x, y), kb: L.kb })
    }
  }
  return out
}

export const estimateMB = (t: { kb: number }[]) => t.reduce((a, x) => a + x.kb, 0) / 1024

export async function downloadTiles(
  list: { url: string }[],
  onProgress: (done: number, total: number) => void,
  signal: AbortSignal,
): Promise<{ ok: number; failed: number }> {
  const cache = await caches.open(CACHE_NAME)
  let i = 0, done = 0, failed = 0
  const worker = async () => {
    while (i < list.length && !signal.aborted) {
      const t = list[i++]
      try {
        if (!(await cache.match(t.url))) {
          const r = await fetch(t.url, { signal })
          if (r.ok) await cache.put(t.url, r)
          else failed++
        }
      } catch { if (!signal.aborted) failed++ }
      onProgress(++done, list.length)
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))
  return { ok: done - failed, failed }
}

export async function cacheStats() {
  const cache = await caches.open(CACHE_NAME)
  const n = (await cache.keys()).length
  const est = await navigator.storage?.estimate?.()
  return { tiles: n, usageMB: (est?.usage ?? 0) / 1048576, quotaMB: (est?.quota ?? 0) / 1048576 }
}
export const clearTiles = () => caches.delete(CACHE_NAME)
