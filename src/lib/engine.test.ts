import { describe, expect, it } from 'vitest'
import { scoreNight, shelterFor, statsFor, windChill, nightFor, type NightStats } from './score'
import { phrase, headline } from './phrase'
import { accessFor, walkMin, fuelCost } from './access'
import { angDiff, compass, fmtDur } from './geo'
import type { Cell, Hour } from './weather'
import type { Place } from './types'

const base: Place = { id: 'a', name: 'Parapeto', kind: 'parapeto', lat: 40.8, lng: -3.95, ele: 2000, shelter: 'parapeto', shelteredFrom: [315], verified: false, source: 't' }

const stats = (o: Partial<NightStats> = {}): NightStats => ({
  tmin: -2, feels: -4, windMean: 30, gustMax: 40, dir: 315, precip: 0, snow: 0, thunder: false, fogHours: 0,
  cloud: 10, rhMax: 70, snowDepth: 0, spread: 1, models: 3, hours: 10, series: [], ...o,
})

describe('geo', () => {
  it('rumbos y diferencias', () => {
    expect(compass(315)).toBe('NO')
    expect(compass(270)).toBe('O')
    expect(angDiff(350, 10)).toBe(20)
    expect(fmtDur(125)).toBe('2 h 05 min')
  })
})

describe('protección', () => {
  it('parapeto protege solo del viento hacia el que mira', () => {
    expect(shelterFor(base, 315).wind).toBeLessThan(0.4)
    expect(shelterFor(base, 135).wind).toBeGreaterThan(0.9)
  })
  it('refugio cerrado casi anula el viento', () => {
    expect(shelterFor({ kind: 'refugio_libre' }, 0).wind).toBeLessThan(0.1)
  })
  it('sensación térmica baja con viento', () => {
    expect(windChill(0, 30)).toBeLessThan(-4)
    expect(windChill(15, 30)).toBe(15)
  })
})

describe('puntuación', () => {
  it('noche suave y sin viento: verde', () => {
    const s = scoreNight({ ...base, shelter: 'cerrado' }, stats({ tmin: 8, feels: 8, windMean: 5, gustMax: 10 }), { threshold: -2 })
    expect(s.level).toBe('verde')
    expect(s.score).toBeGreaterThan(85)
  })
  it('parapeto bien orientado puntúa más que al raso con el mismo viento', () => {
    const a = scoreNight(base, stats(), { threshold: -2 }).score
    const b = scoreNight({ ...base, shelter: 'raso' }, stats(), { threshold: -2 }).score
    expect(a).toBeGreaterThan(b)
  })
  it('la tormenta al raso hunde la noche', () => {
    expect(scoreNight({ ...base, shelter: 'raso' }, stats({ thunder: true, feels: 10, tmin: 10, windMean: 3, gustMax: 5 }), { threshold: -2 }).score).toBeLessThanOrEqual(25)
  })
  it('un umbral de frío mayor baja la nota', () => {
    const warm = scoreNight(base, stats({ feels: 0 }), { threshold: -2 }).score
    const cold = scoreNight(base, stats({ feels: 0 }), { threshold: 4 }).score
    expect(cold).toBeLessThan(warm)
  })
  it('llegar de noche resta', () => {
    const a = scoreNight(base, stats(), { threshold: -2 }).score
    const b = scoreNight(base, stats(), { threshold: -2, arriveDark: true }).score
    expect(b).toBeLessThan(a)
  })
})

describe('frase', () => {
  it('menciona temperatura, viento y protección', () => {
    const sc = scoreNight(base, stats(), { threshold: -2 })
    const f = phrase(stats(), sc, new Date('2026-11-14T22:00:00Z'))
    expect(f).toContain('−2 °C')
    expect(f).toContain('NO sopla a 30 km/h')
    expect(f).toContain('el parapeto te cubre')
    expect(headline(92)).toBe('Noche top')
  })
})

describe('acceso y coste', () => {
  const cotos: Place = { id: 'c', name: 'Cotos', kind: 'parking', lat: 40.823, lng: -3.962, ele: 1830, verified: true, source: 't' }
  const lejos: Place = { id: 'l', name: 'Lejos', kind: 'parking', lat: 40.5, lng: -4.4, ele: 900, verified: true, source: 't' }
  it('elige el aparcamiento de menor tiempo total y descarta los lejanos', () => {
    const o = accessFor(base, [lejos, cotos], { c: { min: 66, km: 56 }, l: { min: 20, km: 10 } })
    expect(o).toHaveLength(1)
    expect(o[0].parking.id).toBe('c')
    expect(o[0].totalMin).toBeGreaterThan(66)
  })
  it('subir tarda más que bajar', () => {
    const up = walkMin({ lat: 40.8, lng: -3.95, ele: 1000 }, { lat: 40.81, lng: -3.95, ele: 1500 })
    const down = walkMin({ lat: 40.8, lng: -3.95, ele: 1500 }, { lat: 40.81, lng: -3.95, ele: 1000 })
    expect(up.min).toBeGreaterThan(down.min)
  })
  it('gasolina ida y vuelta entre los que van', () => {
    const c = fuelCost({ driveKm: 56 } as never, { consumption: 7, fuelPrice: 1.5, people: 4 } as never)
    expect(c.total).toBeCloseTo(11.76, 1)
    expect(c.perPerson).toBeCloseTo(2.94, 1)
  })
})

describe('ventana de noche y estadísticas', () => {
  it('anochece más tarde en verano y la noche acaba al amanecer siguiente', () => {
    const inv = nightFor(new Date('2026-12-20T12:00:00'), 40.8, -3.95)
    const ver = nightFor(new Date('2026-06-20T12:00:00'), 40.8, -3.95)
    expect(ver.sunset.getUTCHours() + ver.sunset.getUTCMinutes() / 60).toBeGreaterThan(inv.sunset.getUTCHours() + inv.sunset.getUTCMinutes() / 60)
    expect(inv.sunrise.getTime()).toBeGreaterThan(inv.sunset.getTime())
  })
  it('corrige la temperatura por altitud (−0,65 °C/100 m)', () => {
    const night = nightFor(new Date('2026-11-14T12:00:00'), 40.8, -3.95)
    const hours: Hour[] = []
    for (let t = night.from.getTime(); t <= night.to.getTime(); t += 3600000)
      hours.push({ t, temp: 5, wind: 10, gust: 15, dir: 0, precip: 0, snow: 0, code: 0, cloud: 0, rh: 50, cape: 0, snowDepth: 0, spread: 0, n: 3 })
    const cell: Cell = { key: 'x', lat: 40.8, lng: -3.95, elev: 1000, hours }
    const s = statsFor(cell, { ...base, ele: 2000 }, night)!
    expect(s.tmin).toBeCloseTo(5 - 6.5, 1)
  })
})

import { distribute, learnMargin, recommend, type GearItem } from './pack'
import type { Entry } from './plan'

describe('mochila', () => {
  const entry = (feels: number, extra: Partial<NightStats> = {}) => ({
    stats: stats({ feels, tmin: feels + 2, ...extra }),
    score: { shelter: shelterFor({ kind: 'parapeto', shelter: 'raso' }, 0) },
    night: { sunset: new Date('2026-11-14T17:30:00') },
  }) as unknown as Entry
  const bags: GearItem[] = [
    { id: '1', cat: 'saco', name: 'Saco verano', weightG: 700, value: 8 },
    { id: '2', cat: 'saco', name: 'Saco invierno', weightG: 1500, value: -8 },
  ]
  it('elige el saco más ligero que aguanta el frío', () => {
    expect(recommend(entry(10), bags)[0].item?.name).toBe('Saco verano')
    expect(recommend(entry(-5), bags)[0].item?.name).toBe('Saco invierno')
  })
  it('avisa si tu mejor saco va justo', () => {
    const l = recommend(entry(-15), bags)[0]
    expect(l.alert).toBe(true)
  })
  it('sumar margen de frío exige un saco más cálido', () => {
    expect(recommend(entry(12), bags, 0)[0].item?.name).toBe('Saco verano')
    expect(recommend(entry(12), bags, 6)[0].item?.name).toBe('Saco invierno')
  })
  it('sin material pide el requisito en lugar de inventar', () => {
    const l = recommend(entry(0), [])[0]
    expect(l.missing).toBe(true)
    expect(l.label).toContain('Saco de confort')
  })
  it('reparte lo común equilibrando el peso', () => {
    const d = distribute([{ key: 'a', label: 'A', reason: '', weightG: 600 }, { key: 'b', label: 'B', reason: '', weightG: 500 }, { key: 'c', label: 'C', reason: '', weightG: 100 }], ['Ana', 'Beto'])
    const w = (n: string) => d[n].reduce((x, l) => x + l.weightG, 0)
    expect(Math.abs(w('Ana') - w('Beto'))).toBeLessThanOrEqual(200)
  })
  it('aprende el margen con límites', () => {
    expect(learnMargin(0, 1)).toBe(1.5)
    expect(learnMargin(7.5, 1)).toBe(8)
    expect(learnMargin(-4, 3)).toBe(-4)
  })
})

describe('tipos de noche y relieve', () => {
  const low: Place = { ...base, id: 'low', ele: 1250, shelter: 'cerrado', tpi: -60 }
  const high: Place = { ...base, id: 'high', ele: 2100, shelter: 'cerrado', tpi: 70 }
  it('en «Aventura» gana el sitio alto; en «Cómoda» no lo penaliza de más', () => {
    const s = stats({ tmin: 6, feels: 6, windMean: 5, gustMax: 10 })
    const av = (p: Place) => scoreNight(p, s, { threshold: -2, mode: 'aventura' }).score
    expect(av(high)).toBeGreaterThan(av(low))
  })
  it('en «Estrellas» manda el cielo despejado y sin luna', () => {
    const clear = stats({ tmin: 6, feels: 6, windMean: 5, gustMax: 10, cloud: 5, rhMax: 55 })
    const cloudy = stats({ tmin: 6, feels: 6, windMean: 5, gustMax: 10, cloud: 95, rhMax: 90 })
    const f = (s: NightStats, moon: number) => scoreNight(high, s, { threshold: -2, mode: 'estrellas', moon }).score
    expect(f(clear, 0.05)).toBeGreaterThan(f(cloudy, 0.05))
    expect(f(clear, 0.05)).toBeGreaterThan(f(clear, 0.98))
  })
  it('la calidad del sitio y el acceso se reflejan por partes', () => {
    const s = stats({ tmin: 8, feels: 8, windMean: 5, gustMax: 10 })
    const a = scoreNight(low, s, { threshold: -2, quality: 100, walkMin: 30 })
    const b = scoreNight(low, s, { threshold: -2, quality: 55, walkMin: 200, accessSnow: true })
    expect(b.parts.calidad).toBeLessThan(a.parts.calidad)
    expect(b.parts.acceso).toBeLessThan(a.parts.acceso)
    expect(b.score).toBeLessThan(a.score)
  })
  it('valle en noche despejada y en calma: más frío que en la ladera; la cresta recibe más viento', () => {
    const night = nightFor(new Date('2026-11-14T12:00:00'), 40.8, -3.95)
    const hours: Hour[] = []
    for (let t = night.from.getTime(); t <= night.to.getTime(); t += 3600000)
      hours.push({ t, temp: 3, wind: 5, gust: 8, dir: 0, precip: 0, snow: 0, code: 0, cloud: 5, rh: 50, cape: 0, snowDepth: 0, spread: 0, n: 3 })
    const cell: Cell = { key: 'x', lat: 40.8, lng: -3.95, elev: 1500, hours }
    const val = statsFor(cell, { ...base, ele: 1500, tpi: -110 }, night)!
    const mid = statsFor(cell, { ...base, ele: 1500, tpi: 0 }, night)!
    const crest = statsFor(cell, { ...base, ele: 1500, tpi: 150 }, night)!
    expect(val.tmin).toBeLessThan(mid.tmin - 1.5)
    expect(crest.windMean).toBeGreaterThan(mid.windMean * 1.3)
  })
})

import { makeIcs, pickPlan, timeline, weekendNights } from './finde'
import { DEFAULT_PREFS } from './prefs'

describe('plan del finde', () => {
  it('encuentra las noches de viernes y sábado', () => {
    const days = Array.from({ length: 10 }, (_, i) => new Date(2026, 10, 5 + i, 12)) // jueves 5 nov 2026
    const n = weekendNights(days)
    expect(n.map((i) => days[i].getDay())).toEqual([5, 6])
  })
  it('el calendario .ics lleva el aviso del día anterior y las coordenadas', () => {
    const ics = makeIcs({ title: 'Vivac; Zabala', start: new Date('2026-11-14T14:00:00Z'), end: new Date('2026-11-15T12:00:00Z'), description: 'a, b', lat: 40.85, lng: -3.96, location: 'Peñalara' })
    expect(ics).toContain('BEGIN:VEVENT')
    expect(ics).toContain('TRIGGER:-P1D')
    expect(ics).toContain('GEO:40.85;-3.96')
    expect(ics).toContain(String.raw`SUMMARY:Vivac\; Zabala`)
    expect(ics).toContain('DTSTART:20261114T140000Z')
  })
  it('sin previsión no inventa un plan', () => {
    const days = [new Date(2026, 10, 6, 12)]
    expect(pickPlan([], days, { wx: null, parkings: [], drive: {}, prefs: DEFAULT_PREFS }, { winter: false })).toBeNull()
    void timeline
  })
})

import { sleepSystem } from './pack'
describe('sistema de dormir', () => {
  const g = (o: Partial<GearItem>): GearItem => ({ id: Math.random().toString(), cat: 'otro', name: 'x', weightG: 100, ...o })
  it('suma saco, forro, funda y ropa y compara con el aire', () => {
    const gear = [g({ cat: 'saco', value: 0, name: 'Saco 3 est.' }), g({ cat: 'saco', value: 4, tag: 'forro', name: 'Forro' }), g({ cat: 'refugio', value: 2, tag: 'funda' }), g({ tag: 'plumas', cat: 'ropa' }), g({ cat: 'aislante', value: 4 })]
    const s = sleepSystem(gear, -2, 0)
    expect(s.comfortC).toBe(0 - 4 - 2 - 3)
    expect(s.verdict).toBe('sobrado')
  })
  it('varios aislantes suman su valor R y uno solo flojo deja la noche en «frío»', () => {
    const weak = [g({ cat: 'saco', value: -8 }), g({ cat: 'aislante', value: 2 })]
    expect(sleepSystem(weak, -4, 0).verdict).toBe('frio')
    const two = [...weak, g({ cat: 'aislante', value: 2 })]
    expect(sleepSystem(two, -4, 0).rTotal).toBe(4)
    expect(sleepSystem(two, -4, 0).verdict).not.toBe('frio')
  })
  it('el margen personal exige más abrigo', () => {
    const gear = [g({ cat: 'saco', value: -5 }), g({ cat: 'aislante', value: 4 })]
    expect(sleepSystem(gear, -4, 0).verdict).not.toBe('frio')
    expect(sleepSystem(gear, -4, 5).verdict).toBe('frio')
  })
  it('sin saco no inventa nada', () => { expect(sleepSystem([], 0, 0).verdict).toBe('sin-saco') })
})

describe('me gusta', () => {
  it('suman puntos a la noche, sin salirse de 100', () => {
    const s = stats({ tmin: 1, feels: 0, windMean: 10, gustMax: 20 })
    const a = scoreNight(base, s, { threshold: -2, like: 0 }).score
    const b = scoreNight(base, s, { threshold: -2, like: 1 }).score
    expect(b).toBeGreaterThan(a)
    expect(scoreNight({ ...base, shelter: 'cerrado' }, stats({ tmin: 9, feels: 9, windMean: 2, gustMax: 5 }), { threshold: -2, like: 1 }).score).toBeLessThanOrEqual(100)
  })
})
