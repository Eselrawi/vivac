import { useSyncExternalStore } from 'react'
import { HOME } from './types'

export interface Prefs {
  homeName: string
  homeLat: number
  homeLng: number
  marginMin: number // margen para montar y cenar con luz
  consumption: number // l/100 km
  fuelPrice: number // €/l
  people: number // por coche
  threshold: number // °C de sensación a partir de los que el grupo pasa frío
  coldMargin: number // °C extra de frío que has notado (se aprende)
  names: string[] // quién suele venir
  contacts: { name: string; phone: string }[] // contactos de emergencia
  units: 'm' | 'ft'
  nightMode: 'comoda' | 'aventura' | 'estrellas'
  discover: boolean // incluir sitios sugeridos por el relieve
  theme: 'auto' | 'claro' | 'oscuro' | 'rojo'
}

const DEFAULT: Prefs = {
  homeName: HOME.name, homeLat: HOME.lat, homeLng: HOME.lng,
  marginMin: 60, consumption: 7, fuelPrice: 1.55, people: 3, threshold: -2, coldMargin: 0, names: ["Yo"], contacts: [], units: 'm', nightMode: 'comoda', discover: false, theme: 'auto',
}

const KEY = 'vivac.prefs'
let state: Prefs = { ...DEFAULT, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>) }
const subs = new Set<() => void>()

export const getPrefs = () => state
export function setPrefs(p: Partial<Prefs>) {
  state = { ...state, ...p }
  localStorage.setItem(KEY, JSON.stringify(state))
  subs.forEach((f) => f())
}
export const usePrefs = () =>
  useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb) }, () => state)
