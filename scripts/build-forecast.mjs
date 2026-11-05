// Previsión de toda la sierra, precalculada (rejilla de 0,1°, 3 modelos, 10 días) → public/data/forecast.json
// Así los móviles no llaman a Open-Meteo: funciona sin conexión y sin bloqueos por exceso de peticiones.
import { readFileSync, writeFileSync } from 'node:fs'

const STEP = 0.1
const MODELS = ['ecmwf_ifs025', 'icon_seamless', 'meteofrance_seamless']
const VARS = ['temperature_2m', 'wind_speed_10m', 'wind_gusts_10m', 'wind_direction_10m', 'precipitation', 'snowfall', 'weather_code', 'cloud_cover', 'relative_humidity_2m', 'cape', 'snow_depth']
const read = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')) } catch { return [] } }
const pts = [...read('public/data/places.json'), ...read('public/data/discover.json')].filter((p) => ['refugio_libre', 'refugio_pago', 'parapeto', 'abrigo', 'candidato', 'parking'].includes(p.kind))
const cells = new Map()
for (const p of pts) {
  const key = `${Math.floor(p.lat / STEP)}_${Math.floor(p.lng / STEP)}`
  if (!cells.has(key)) cells.set(key, { key, lat: (Math.floor(p.lat / STEP) + 0.5) * STEP, lng: (Math.floor(p.lng / STEP) + 0.5) * STEP })
}
const list = [...cells.values()]
console.log('celdas:', list.length)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN)
async function fetchBatch(batch) {
  const qs = new URLSearchParams({
    latitude: batch.map((c) => c.lat.toFixed(3)).join(','), longitude: batch.map((c) => c.lng.toFixed(3)).join(','),
    hourly: VARS.join(','), models: MODELS.join(','), timezone: 'Europe/Madrid', timeformat: 'unixtime', forecast_days: '10', wind_speed_unit: 'kmh',
  })
  for (let i = 0; i < 7; i++) {
    try {
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?${qs}`)
      if (r.ok) { const j = await r.json(); return Array.isArray(j) ? j : [j] }
      console.log('Open-Meteo', r.status, 'reintento', i + 1)
    } catch (e) { console.log('red', String(e).slice(0, 60)) }
    await sleep(15000 * (i + 1))
  }
  throw new Error('Open-Meteo no responde')
}
const r1 = (x) => Math.round(x * 10)

const out = { generated: new Date().toISOString(), step: STEP, models: MODELS, cells: {} }
for (let i = 0; i < list.length; i += 10) {
  const batch = list.slice(i, i + 10)
  const res = await fetchBatch(batch)
  res.forEach((loc, k) => {
    const raw = loc.hourly
    const n = raw.time.length
    const col = { temp: [], wind: [], gust: [], dir: [], precip: [], snow: [], code: [], cloud: [], rh: [], cape: [], sd: [], spread: [], n: [] }
    for (let h = 0; h < n; h++) {
      const get = (name) => MODELS.map((m) => raw[`${name}_${m}`]?.[h]).filter((x) => typeof x === 'number')
      const temps = get('temperature_2m')
      if (!temps.length) { for (const key of Object.keys(col)) col[key].push(null); continue }
      const dirs = get('wind_direction_10m')
      const sx = mean(dirs.map((d) => Math.sin((d * Math.PI) / 180))), cx = mean(dirs.map((d) => Math.cos((d * Math.PI) / 180)))
      const codes = get('weather_code')
      col.temp.push(r1(mean(temps))); col.wind.push(r1(mean(get('wind_speed_10m')) || 0)); col.gust.push(r1(mean(get('wind_gusts_10m')) || 0))
      col.dir.push(dirs.length ? Math.round(((Math.atan2(sx, cx) * 180) / Math.PI + 360) % 360) : 0)
      col.precip.push(r1(mean(get('precipitation')) || 0)); col.snow.push(r1(mean(get('snowfall')) || 0)); col.code.push(codes.length ? Math.max(...codes) : 0)
      col.cloud.push(Math.round(mean(get('cloud_cover')) || 0)); col.rh.push(Math.round(mean(get('relative_humidity_2m')) || 0)); col.cape.push(Math.round(mean(get('cape')) || 0))
      col.sd.push(Math.round((mean(get('snow_depth')) || 0) * 100)); col.spread.push(r1(temps.length > 1 ? Math.max(...temps) - Math.min(...temps) : 0)); col.n.push(temps.length)
    }
    out.cells[batch[k].key] = { lat: batch[k].lat, lng: batch[k].lng, elev: Math.round(loc.elevation ?? 1500), t0: raw.time[0], h: col }
  })
  console.log('lote', i / 10 + 1, '/', Math.ceil(list.length / 10))
  await sleep(4000)
}
writeFileSync('public/data/forecast.json', JSON.stringify(out))
console.log('forecast.json', (JSON.stringify(out).length / 1024).toFixed(0), 'KB', out.generated)
