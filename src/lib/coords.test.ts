import { describe, expect, it } from 'vitest'
import { parseCoords, toUTM, inSierra } from './coords'

describe('coordenadas', () => {
  it('lee decimales y enlaces', () => {
    expect(parseCoords('40.82327, -3.96243')).toEqual({ lat: 40.82327, lng: -3.96243 })
    expect(parseCoords('40,82327 -3,96243')).toEqual({ lat: 40.82327, lng: -3.96243 })
    expect(parseCoords('https://www.google.com/maps/@40.8232,-3.9624,15z')).toEqual({ lat: 40.8232, lng: -3.9624 })
    expect(parseCoords('https://maps.google.com/?q=40.8232,-3.9624')).toEqual({ lat: 40.8232, lng: -3.9624 })
    expect(parseCoords('https://www.openstreetmap.org/#map=16/40.8232/-3.9624')).toEqual({ lat: 40.8232, lng: -3.9624 })
    expect(parseCoords('geo:40.8232,-3.9624')).toEqual({ lat: 40.8232, lng: -3.9624 })
  })
  it('lee hemisferios y grados-minutos-segundos', () => {
    expect(parseCoords('40.82327 N, 3.96243 O')).toEqual({ lat: 40.82327, lng: -3.96243 })
    const d = parseCoords(`40°49'23" N, 3°57'45" O`)!
    expect(d.lat).toBeCloseTo(40.8231, 3)
    expect(d.lng).toBeCloseTo(-3.9625, 3)
  })
  it('rechaza lo que no son coordenadas', () => {
    expect(parseCoords('hola')).toBeNull()
    expect(parseCoords('120.5, 300.2')).toBeNull()
  })
  it('UTM coincide con el listado oficial (La Najarra: 429318, 4518259)', () => {
    const u = toUTM(40.81229, -3.83811)
    expect(u.zone).toBe(30)
    expect(Math.abs(u.e - 429318)).toBeLessThan(120)
    expect(Math.abs(u.n - 4518259)).toBeLessThan(120)
  })
  it('detecta si está en la sierra', () => {
    expect(inSierra({ lat: 40.8, lng: -3.96 })).toBe(true)
    expect(inSierra({ lat: 37.4, lng: -5.9 })).toBe(false)
  })
})
