import { FetchSource, type RangeResponse, type Source } from 'pmtiles'

/** Mapa vectorial propio de la sierra (extracto de Protomaps/OpenStreetMap), alojado junto a la app. */
export const PM_URL = new URL(`${import.meta.env.BASE_URL}data/sierra.pmtiles`, location.href).href
export const VEC_CACHE = 'rutas'

/** Lee del archivo descargado en el móvil si existe; si no, pide solo los trozos que hacen falta por red. */
export class HybridSource implements Source {
  private buf: ArrayBuffer | null = null
  private lastCheck = 0
  private net: FetchSource
  private url: string
  constructor(url: string) { this.url = url; this.net = new FetchSource(url) }
  getKey() { return this.url }
  async getBytes(offset: number, length: number, signal?: AbortSignal, etag?: string): Promise<RangeResponse> {
    if (!this.buf && 'caches' in self && Date.now() - this.lastCheck > 5000) {
      this.lastCheck = Date.now()
      const hit = await (await caches.open(VEC_CACHE)).match(this.url).catch(() => undefined)
      if (hit) this.buf = await hit.arrayBuffer()
    }
    if (this.buf) return { data: this.buf.slice(offset, offset + length) }
    return this.net.getBytes(offset, length, signal, etag)
  }
}

export async function downloadVector(onProgress: (done: number, total: number) => void): Promise<boolean> {
  const r = await fetch(PM_URL)
  if (!r.ok || !r.body) return false
  const total = Number(r.headers.get('content-length')) || 19e6
  const reader = r.body.getReader()
  const chunks: Uint8Array[] = []
  let got = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value); got += value.length
    onProgress(got, total)
  }
  const blob = new Blob(chunks as BlobPart[], { type: 'application/octet-stream' })
  await (await caches.open(VEC_CACHE)).put(PM_URL, new Response(blob, { headers: { 'content-type': 'application/octet-stream' } }))
  return true
}

export const hasVector = async () => !!(await (await caches.open(VEC_CACHE)).match(PM_URL))
