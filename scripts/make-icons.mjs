import sharp from 'sharp'
import { readFileSync } from 'node:fs'

const svg = readFileSync('public/icon.svg')
const out = (n, s, pad = 0) =>
  sharp(svg, { density: 384 })
    .resize(s - pad * 2, s - pad * 2)
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: '#2b3f5e' })
    .png()
    .toFile(`public/${n}`)

await out('icon-192.png', 192)
await out('icon-512.png', 512)
await out('icon-maskable-512.png', 512, 64)
await out('apple-touch-icon.png', 180)
console.log('iconos listos')
