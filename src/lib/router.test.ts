// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'

type Out = { type: string; id?: number; ok?: boolean; coords?: number[][]; dist?: number; asc?: number; error?: string }
const sent: Out[] = []
let call: (m: unknown) => Promise<void>

beforeAll(async () => {
  const g = globalThis as unknown as { self: { postMessage: (m: Out) => void; onmessage?: (e: { data: unknown }) => Promise<void> }; fetch: unknown }
  g.self = { postMessage: (m) => { sent.push(m) } }
  g.fetch = async () => ({ json: async () => JSON.parse(readFileSync('public/data/graph.json', 'utf8')) })
  await import('./router.worker')
  call = (m) => g.self.onmessage!({ data: m })
  await call({ type: 'load', url: 'x' })
}, 60000)

const route = async (id: number, from: [number, number], to: [number, number], profile: string) => {
  await call({ type: 'route', id, from, to, profile })
  return sent.find((s) => s.type === 'result' && s.id === id)!
}

describe('enrutador a pie', () => {
  const cotos: [number, number] = [40.82327, -3.96243]
  const zabala: [number, number] = [40.8505, -3.9578] // laguna Grande de Peñalara (aprox.)

  it('calcula una ruta de Cotos hacia Peñalara con distancia y desnivel razonables', async () => {
    const r = await route(1, cotos, zabala, 'directo')
    expect(r.ok).toBe(true)
    expect(r.dist!).toBeGreaterThan(2500)
    expect(r.dist!).toBeLessThan(12000)
    expect(r.asc!).toBeGreaterThan(100)
  })

  it('el perfil «de noche» no es más corto que el directo y sigue conectando', async () => {
    const d = await route(2, cotos, zabala, 'directo')
    const n = await route(3, cotos, zabala, 'noche')
    expect(n.ok).toBe(true)
    expect(n.dist!).toBeGreaterThanOrEqual(d.dist! * 0.95)
  })

  it('avisa si el punto está lejos de cualquier camino', async () => {
    const r = await route(4, [38.0, -2.0], zabala, 'directo')
    expect(r.ok).toBe(false)
    expect(r.error).toBeTruthy()
  })
})
