import type { Entry } from './plan'

export type Cat = 'saco' | 'aislante' | 'refugio' | 'ropa' | 'cocina' | 'luz' | 'invierno' | 'otro'
export const CATS: { id: Cat; label: string; emoji: string }[] = [
  { id: 'saco', label: 'Sacos', emoji: '🛌' },
  { id: 'aislante', label: 'Aislantes', emoji: '🟫' },
  { id: 'refugio', label: 'Refugio y funda', emoji: '⛺' },
  { id: 'ropa', label: 'Ropa', emoji: '🧥' },
  { id: 'cocina', label: 'Cocina', emoji: '🍳' },
  { id: 'luz', label: 'Luz', emoji: '🔦' },
  { id: 'invierno', label: 'Invierno', emoji: '❄️' },
  { id: 'otro', label: 'Otros', emoji: '🎒' },
]

export interface GearItem {
  id: string
  cat: Cat
  name: string
  weightG: number
  /** Saco: temperatura de confort (°C). Aislante: valor R. */
  value?: number | null
  /** Pista para ropa: base | medio | plumas | cortavientos | gorro | guantes */
  tag?: string
  shared?: boolean
}

export interface PackLine {
  key: string
  label: string
  reason: string
  item?: GearItem
  missing?: boolean
  weightG: number
  shared?: boolean
  alert?: boolean
}

const lightest = (xs: GearItem[]) => [...xs].sort((a, b) => a.weightG - b.weightG)[0]

/** Reglas simples y explicables. `margin` = °C de frío extra que esta persona suele notar. */
export function recommend(e: Entry, gear: GearItem[], margin = 0): PackLine[] {
  const s = e.stats
  const covered = e.score.shelter.covered
  const lines: PackLine[] = []
  const feels = s.feels
  const needComfort = feels - 2 + margin * -1 // más margen → exigimos un saco más cálido
  const need = feels - 2 - margin

  // Saco
  const bags = gear.filter((g) => g.cat === 'saco' && g.value != null)
  const okBags = bags.filter((g) => (g.value as number) <= need)
  const bag = okBags.length ? lightest(okBags) : [...bags].sort((a, b) => (a.value as number) - (b.value as number))[0]
  lines.push({
    key: 'saco', label: bag ? bag.name : `Saco de confort ≤ ${Math.round(need)} °C`,
    reason: okBags.length || !bag ? `Se esperan ${Math.round(feels)} °C de sensación${margin ? ` y sueles notar ${margin > 0 ? 'más frío' : 'más calor'} (${margin > 0 ? '+' : ''}${margin} °C)` : ''}` : `Tu saco más cálido (${bag.value} °C) va justo: añade forro o ropa seca`,
    item: bag, missing: !bag, weightG: bag?.weightG ?? 1200, alert: !!bag && !okBags.length,
  })
  void needComfort

  // Aislante
  const r = s.tmin < -10 ? 5 : s.tmin < 0 ? 4 : s.tmin < 6 ? 3 : 2
  const pads = gear.filter((g) => g.cat === 'aislante' && g.value != null)
  const okPads = pads.filter((g) => (g.value as number) >= r)
  const pad = okPads.length ? lightest(okPads) : [...pads].sort((a, b) => (b.value as number) - (a.value as number))[0]
  lines.push({
    key: 'aislante', label: pad ? pad.name : `Aislante con valor R ≥ ${r}`,
    reason: `El suelo enfría más que el aire: con mínima de ${Math.round(s.tmin)} °C pide R ${r}${pad && !okPads.length ? ` (el tuyo es R ${pad.value}: pon otro debajo)` : ''}`,
    item: pad, missing: !pad, weightG: pad?.weightG ?? 500, alert: !!pad && !okPads.length,
  })

  // Funda / tarp
  const wet = s.precip * e.score.shelter.rain >= 0.5 || s.snow >= 1
  const dew = !covered && s.rhMax > 92 && s.tmin < 3
  if (!covered && (wet || dew || s.windMean > 25)) {
    const shell = gear.filter((g) => g.cat === 'refugio')
    const it = lightest(shell)
    lines.push({ key: 'funda', label: it ? it.name : 'Funda de vivac o tarp', reason: wet ? 'Al raso y con precipitación' : dew ? 'Humedad alta y frío: habrá rocío o escarcha' : 'Viento: una funda corta el aire', item: it, missing: !it, weightG: it?.weightG ?? 400 })
  }

  // Ropa
  const clothes = (tag: string, label: string, reason: string, w = 300) => {
    const it = lightest(gear.filter((g) => g.cat === 'ropa' && g.tag === tag))
    lines.push({ key: `ropa-${tag}`, label: it ? it.name : label, reason, item: it, missing: !it, weightG: it?.weightG ?? w })
  }
  clothes('base', 'Camiseta térmica de repuesto', 'Para dormir seco', 200)
  if (feels < 8) clothes('medio', 'Forro o capa intermedia', 'Capa de abrigo para la cena', 400)
  if (feels < 2) clothes('plumas', 'Chaqueta de plumas', `Sensación de ${Math.round(feels)} °C al cenar y por la mañana`, 450)
  if (s.windMean > 20 || wet) clothes('cortavientos', 'Cortavientos / impermeable', wet ? 'Se espera agua o nieve' : 'Viento sostenido', 300)
  if (feels < 3) { clothes('gorro', 'Gorro', 'Por la cabeza se va mucho calor', 60); clothes('guantes', 'Guantes', 'Manos con ese frío', 120) }

  // Invierno
  if (s.snowDepth > 0.15) lines.push({ key: 'crampones', label: 'Crampones y polainas', reason: `Nieve acumulada (~${Math.round(s.snowDepth * 100)} cm) en la zona`, weightG: 900, alert: true, missing: !gear.some((g) => g.cat === 'invierno') })

  // Cocina y agua
  lines.push({ key: 'hornillo', label: 'Hornillo y gas', reason: 'Material común: se reparte entre el grupo', weightG: 600, shared: true, item: lightest(gear.filter((g) => g.cat === 'cocina' && g.shared)) })
  const litres = s.tmin < -1 ? 3 : 2
  lines.push({ key: 'agua', label: `Agua (${litres} L por persona)`, reason: s.tmin < -1 ? 'Las fuentes y el bidón expuesto pueden helarse: duerme con el agua dentro del saco' : 'Comprueba antes si la fuente sigue con agua', weightG: litres * 1000 })

  // Luz y baterías
  const lamp = lightest(gear.filter((g) => g.cat === 'luz'))
  lines.push({ key: 'frontal', label: lamp ? lamp.name : 'Frontal con pilas nuevas', reason: `Anochece a las ${e.night.sunset.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`, item: lamp, missing: !lamp, weightG: lamp?.weightG ?? 90 })
  if (s.tmin < 2) lines.push({ key: 'bateria', label: 'Batería externa', reason: 'El frío gasta las baterías: duerme con móvil y batería dentro del saco', weightG: 250 })

  // Lista de invierno completa: cada cosa con su porqué
  const cold = s.tmin < 0
  const has = (cat: Cat, tag?: string) => gear.some((g) => g.cat === cat && (!tag || g.tag === tag))
  if (cold) {
    lines.push({ key: 'gas-inv', label: 'Gas de invierno', reason: `Con ${Math.round(s.tmin)} °C el gas normal no arranca: usa mezcla de invierno y guarda el bote en el saco`, weightG: 450, shared: true, missing: !gear.some((g) => /gas de invierno/i.test(g.name)) })
    lines.push({ key: 'botella-cal', label: 'Botella de agua caliente', reason: 'Metida en el saco calienta los pies toda la noche (y el agua no se hiela)', weightG: 150, missing: !gear.some((g) => /agua caliente/i.test(g.name)) })
    lines.push({ key: 'pilas-litio', label: 'Pilas de litio de repuesto', reason: 'Las alcalinas se agotan con el frío; el frontal no puede fallar', weightG: 60, missing: !gear.some((g) => /litio/i.test(g.name)) })
    lines.push({ key: 'manta-term', label: 'Manta térmica de emergencia', reason: 'Pesa 90 g y puede salvar una noche', weightG: 90, missing: !gear.some((g) => /manta térmica/i.test(g.name)) })
  }
  if (s.snowDepth > 0.3) lines.push({ key: 'raquetas', label: 'Raquetas de nieve', reason: `Hay unos ${Math.round(s.snowDepth * 100)} cm de nieve: sin raquetas te hundes y gastas el doble`, weightG: 1900, alert: true, missing: !gear.some((g) => /raquetas/i.test(g.name)) })
  else if (s.snowDepth > 0.08 || (cold && s.rhMax > 80)) lines.push({ key: 'crampones-inv', label: 'Crampones o microcrampones', reason: 'Nieve dura o hielo en el sendero a primera hora y al volver', weightG: 900, missing: !has('invierno') })
  if (cold || s.snowDepth > 0.05) lines.push({ key: 'botiquin', label: 'Botiquín con manta térmica y vendaje', reason: 'Con frío una torcedura se convierte en problema serio', weightG: 250, shared: true })
  return lines
}

export interface SleepSystem {
  /** Temperatura de confort del conjunto (saco + forro + funda + ropa de abrigo), en °C. */
  comfortC: number | null
  /** Valor R sumado de todos los aislantes. */
  rTotal: number
  /** Temperatura mínima del AIRE esperada (no la sensación térmica), más el margen personal aprendido. */
  needC: number
  verdict: 'sobrado' | 'justo' | 'frio' | 'sin-saco'
  parts: string[]
}

/** Suma el sistema de dormir y lo compara con la mínima real del aire más tu margen personal (los sacos se clasifican con el aire, no con el viento). */
export function sleepSystem(gear: GearItem[], tminAir: number, margin = 0): SleepSystem {
  const bags = gear.filter((g) => g.cat === 'saco' && g.value != null && g.tag !== 'forro')
  const bag = [...bags].sort((a, b) => (a.value as number) - (b.value as number))[0] // el más cálido
  const liner = gear.filter((g) => g.tag === 'forro').reduce((a, g) => a + ((g.value as number) ?? 0), 0)
  const bivy = gear.filter((g) => g.tag === 'funda').reduce((a, g) => a + ((g.value as number) ?? 1.5), 0)
  const clothes = (gear.some((g) => g.tag === 'plumas') ? 3 : 0) + (gear.some((g) => g.tag === 'medio') ? 1.5 : 0)
  const pads = gear.filter((g) => g.cat === 'aislante' && g.value != null)
  const rTotal = pads.reduce((a, g) => a + (g.value as number), 0)
  const needC = tminAir - margin
  if (!bag) return { comfortC: null, rTotal, needC, verdict: 'sin-saco', parts: [] }
  const comfortC = (bag.value as number) - liner - bivy - clothes
  const diff = needC - comfortC
  const padOk = rTotal >= (tminAir < -10 ? 5 : tminAir < 0 ? 4 : tminAir < 6 ? 3 : 2)
  const verdict = diff >= 4 && padOk ? 'sobrado' : diff >= 0 && padOk ? 'justo' : 'frio'
  const parts = [bag.name, ...(liner ? [`forro (+${liner} °C)`] : []), ...(bivy ? [`funda (+${bivy} °C)`] : []), ...(clothes ? [`ropa de abrigo (+${clothes} °C)`] : [])]
  return { comfortC, rTotal, needC, verdict: padOk || verdict === 'frio' ? verdict : 'frio', parts }
}

export const totalG = (ls: PackLine[], skipShared = false) => ls.filter((l) => !(skipShared && l.shared)).reduce((a, l) => a + l.weightG, 0)

/** Reparte el material común por peso, empezando siempre por quien menos lleva. */
export function distribute(shared: PackLine[], people: string[]): Record<string, PackLine[]> {
  const out: Record<string, PackLine[]> = Object.fromEntries(people.map((p) => [p, []]))
  const load: Record<string, number> = Object.fromEntries(people.map((p) => [p, 0]))
  for (const l of [...shared].sort((a, b) => b.weightG - a.weightG)) {
    const who = people.reduce((m, p) => (load[p] < load[m] ? p : m), people[0])
    out[who].push(l)
    load[who] += l.weightG
  }
  return out
}

/** Ajusta el margen personal tras preguntar «¿frío, bien o calor?». */
export function learnMargin(current: number, felt: 1 | 2 | 3): number {
  const next = felt === 1 ? current + 1.5 : felt === 3 ? current - 1 : current * 0.9
  return Math.max(-4, Math.min(8, Math.round(next * 10) / 10))
}
