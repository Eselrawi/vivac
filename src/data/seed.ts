import type { Place } from '../lib/types'

// Puntos de arranque. La base completa (OSM + listados oficiales) llega en la fase 3.
export const SEED: Place[] = [
  { id: 'p-cotos', name: 'Puerto de Cotos', kind: 'parking', lat: 40.8227, lng: -3.9686, ele: 1830, verified: false, source: 'manual' },
  { id: 'p-navacerrada', name: 'Puerto de Navacerrada', kind: 'parking', lat: 40.7813, lng: -4.0097, ele: 1860, verified: false, source: 'manual' },
  { id: 'c-penalara', name: 'Peñalara', kind: 'deseo', lat: 40.8502, lng: -3.9567, ele: 2428, shelter: 'raso', verified: false, source: 'manual' },
]
