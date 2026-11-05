import { describe, expect, it } from 'vitest'
import { buildSteps, cumulative, kindFor, locate, nextStep, spoken } from './guide'
import { mapOsrmSteps } from './drive'

// Línea hacia el este 200 m, luego hacia el sur 200 m (giro a la derecha), luego hacia el este (giro a la izquierda).
const M = 1 / 111320
const L = (x: number, y: number): [number, number, number] => [-3.9 + x * M * 1.3, 40.8 + y * M, 1000]
const path = [L(0, 0), L(100, 0), L(200, 0), L(200, -100), L(200, -200), L(300, -200), L(400, -200)]

describe('indicaciones', () => {
  it('clasifica los giros', () => {
    expect(kindFor(10)).toBeNull()
    expect(kindFor(50)).toBe('slight-right')
    expect(kindFor(-90)).toBe('left')
    expect(kindFor(140)).toBe('sharp-right')
    expect(kindFor(-178)).toBe('uturn')
  })
  it('detecta derecha e izquierda en orden', () => {
    const s = buildSteps(path)
    expect(s.map((x) => x.kind)).toEqual(['start', 'right', 'left', 'arrive'])
    expect(s[0].text).toBe('Sal hacia el este')
    expect(Math.abs(s[1].at - 200)).toBeLessThan(15)
    expect(Math.abs(s[2].at - 400)).toBeLessThan(15)
  })
  it('una recta no genera giros', () => {
    const s = buildSteps([L(0, 0), L(100, 0), L(300, 0)])
    expect(s.map((x) => x.kind)).toEqual(['start', 'arrive'])
  })
  it('sigue el avance sobre la ruta y da el siguiente paso', () => {
    const cum = cumulative(path)
    const p = L(50, 3)
    const loc = locate(path, cum, p[1], p[0], 0)
    expect(loc.d).toBeLessThan(5)
    expect(Math.abs(loc.along - 50)).toBeLessThan(5)
    const n = nextStep(buildSteps(path), loc.along)!
    expect(n.step.kind).toBe('right')
    expect(n.toNext).toBeGreaterThan(130)
  })
  it('detecta que me salí del camino', () => {
    const cum = cumulative(path)
    const p = L(100, 120)
    expect(locate(path, cum, p[1], p[0], 0).d).toBeGreaterThan(60)
  })
  it('frases habladas', () => {
    expect(spoken({ at: 0, kind: 'right', text: 'Gira a la derecha' }, 150)).toBe('En 150 metros, gira a la derecha')
    expect(spoken({ at: 0, kind: 'left', text: 'Gira a la izquierda' }, 10)).toBe('Gira a la izquierda ahora')
    expect(spoken({ at: 0, kind: 'left', text: 'Gira a la izquierda', road: 'M-601' }, 800)).toBe('En 800 metros, gira a la izquierda por M-601')
  })
})

describe('ruta en coche (OSRM)', () => {
  it('traduce las maniobras y acumula distancias', () => {
    const s = mapOsrmSteps([
      { distance: 500, name: 'Calle Mayor', maneuver: { type: 'depart' } },
      { distance: 1200, name: 'M-601', maneuver: { type: 'turn', modifier: 'right' } },
      { distance: 80, name: '', maneuver: { type: 'roundabout', exit: 2 } },
      { distance: 300, name: 'M-601', maneuver: { type: 'exit roundabout' } },
      { distance: 0, name: '', maneuver: { type: 'arrive' } },
    ])
    expect(s.map((x) => x.kind)).toEqual(['start', 'right', 'roundabout', 'arrive'])
    expect(s[1].at).toBe(500)
    expect(s[1].road).toBe('M-601')
    expect(s[2].text).toContain('segunda')
    expect(s[3].at).toBe(2080)
  })
})
