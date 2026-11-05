// Altitud de cualquier punto con el modelo de elevación (Terrain Tiles, formato terrarium). Funciona sin conexión si la teselas están guardadas.
const Z = 12
const cache = new Map<string, ImageData | null>()

async function tile(x: number, y: number): Promise<ImageData | null> {
  const k = `${x}/${y}`
  if (cache.has(k)) return cache.get(k)!
  try {
    const r = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${x}/${y}.png`)
    if (!r.ok) throw new Error(String(r.status))
    const bmp = await createImageBitmap(await r.blob())
    const c = new OffscreenCanvas(bmp.width, bmp.height)
    const g = c.getContext('2d')!
    g.drawImage(bmp, 0, 0)
    const img = g.getImageData(0, 0, bmp.width, bmp.height)
    cache.set(k, img)
    return img
  } catch {
    cache.set(k, null)
    return null
  }
}

export async function elevationAt(lat: number, lng: number): Promise<number | null> {
  const n = 2 ** Z
  const rad = (lat * Math.PI) / 180
  const fx = ((lng + 180) / 360) * n
  const fy = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n
  const img = await tile(Math.floor(fx), Math.floor(fy))
  if (!img) return null
  const px = Math.min(img.width - 1, Math.floor((fx % 1) * img.width))
  const py = Math.min(img.height - 1, Math.floor((fy % 1) * img.height))
  const i = (py * img.width + px) * 4
  return Math.round(img.data[i] * 256 + img.data[i + 1] + img.data[i + 2] / 256 - 32768)
}
