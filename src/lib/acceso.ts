import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { db } from './db'
import { getSb, GROUP_KEY } from './sb'

export type Estado = 'abierto' | 'parcial' | 'llave' | 'reserva' | 'cerrado' | 'sin_datos'
export interface Fuente { site: string; url?: string; fecha: string | null }
export interface Acceso {
  estado: Estado
  nota: string
  fecha: string | null
  fuentes: Fuente[]
  precio?: { texto: string; fecha: string | null } | null
  llave?: { quien?: string; tel?: string; web?: string; horario?: string; fianza?: string } | null
  invierno: { puerta: string | null; chimenea: string | null; lena: string | null; suelo: string | null; plazas: string | null; llena: string | null; agua: string; nieveAcceso: string | null }
}
export interface Descartado { id: string; name: string; kind: string; lat: number; lng: number; ele: number | null; motivo: string; fuente: string }
export type ReportState = 'abierto' | 'candado' | 'ruinas' | 'lleno'
export interface Report { at: number; state: ReportState; by?: string; remote?: boolean }

export const ESTADO_UI: Record<Estado, { emoji: string; label: string; color: string }> = {
  abierto: { emoji: '🟢', label: 'Abierto', color: '#3f8a68' },
  parcial: { emoji: '🟡', label: 'Abierto en parte', color: '#e5b23a' },
  llave: { emoji: '🔑', label: 'Hay que pedir la llave', color: '#e08a35' },
  reserva: { emoji: '📅', label: 'Con reserva o de pago', color: '#3a86c8' },
  cerrado: { emoji: '🔴', label: 'Cerrado, privado o en ruinas', color: '#d1553f' },
  sin_datos: { emoji: '⚪', label: 'Sin datos', color: '#8a8c8f' },
}
export const REPORT_UI: Record<ReportState, { emoji: string; label: string }> = {
  abierto: { emoji: '🟢', label: 'Estaba abierto' },
  candado: { emoji: '🔒', label: 'Con candado' },
  ruinas: { emoji: '🏚️', label: 'En ruinas' },
  lleno: { emoji: '👥', label: 'Estaba lleno' },
}

let data: Record<string, Acceso> | null = null
let descartados: Descartado[] = []
let reports: Record<string, Report[]> = {}
let loading: Promise<void> | null = null
const subs = new Set<() => void>()
let version = 0
const emit = () => { version++; subs.forEach((f) => f()) }

async function load() {
  const base = import.meta.env.BASE_URL
  const [a, d, row] = await Promise.all([
    fetch(`${base}data/acceso.json`).then((r) => r.json()).catch(() => ({})),
    fetch(`${base}data/descartados.json`).then((r) => r.json()).catch(() => []),
    db.kv.get('reports'),
  ])
  data = a; descartados = d; reports = (row?.v as Record<string, Report[]>) ?? {}
  emit()
}

/** Descarga los avisos del grupo («¿Cómo estaba?») y los junta con los de este móvil. */
export async function pullReports() {
  const gid = localStorage.getItem(GROUP_KEY)
  if (!gid || !navigator.onLine) return
  try {
    const sb = await getSb()
    const { data: rows } = await sb.from('place_notes').select('place_ref,data,created_at,created_by').eq('kind', 'status')
    const next: Record<string, Report[]> = {}
    for (const [k, v] of Object.entries(reports)) next[k] = v.filter((r) => !r.remote)
    for (const r of rows ?? []) (next[r.place_ref] ??= []).push({ at: new Date(r.created_at).getTime(), state: r.data?.state, by: r.created_by, remote: true })
    reports = next
    await db.kv.put({ k: 'reports', v: reports })
    emit()
  } catch { /* sin red */ }
}

export async function addReport(id: string, state: ReportState) {
  const rep: Report = { at: Date.now(), state }
  reports = { ...reports, [id]: [rep, ...(reports[id] ?? [])] }
  await db.kv.put({ k: 'reports', v: reports })
  emit()
  const gid = localStorage.getItem(GROUP_KEY)
  if (gid && navigator.onLine) {
    try { await (await getSb()).from('place_notes').insert({ group_id: gid, place_ref: id, kind: 'status', data: { state } }) } catch { /* se queda guardado en este móvil */ }
  }
}

const TWO_YEARS = 730 * 86400000
const FROM_REPORT: Record<ReportState, Estado> = { abierto: 'abierto', candado: 'llave', ruinas: 'cerrado', lleno: 'abierto' }

export function effective(id: string): { estado: Estado; acceso: Acceso | null; report: Report | null; full: boolean } {
  const acceso = data?.[id] ?? null
  const rep = (reports[id] ?? []).filter((r) => Date.now() - r.at < TWO_YEARS).sort((a, b) => b.at - a.at)[0] ?? null
  if (rep) return { estado: FROM_REPORT[rep.state], acceso, report: rep, full: rep.state === 'lleno' }
  return { estado: acceso?.estado ?? 'sin_datos', acceso, report: null, full: false }
}

export function useAcceso() {
  useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb) }, () => version)
  const [, force] = useState(0)
  useEffect(() => {
    loading ??= load().then(() => pullReports())
    loading.then(() => force((n) => n + 1))
  }, [])
  const report = useCallback((id: string, s: ReportState) => addReport(id, s), [])
  return { ready: !!data, effective, descartados, report, reports }
}
