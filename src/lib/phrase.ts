import { compass } from './geo'
import type { NightStats, Score } from './score'
import { moonInfo } from './score'

const t = (n: number) => `${Math.round(n)} °C`.replace('-', '−')

export function headline(score: number) {
  return score >= 85 ? 'Noche top' : score >= 70 ? 'Buena noche' : score >= 55 ? 'Noche aceptable' : score >= 40 ? 'Noche dura' : 'Mejor no ir'
}

/** Frase humana de la noche, p. ej. «Noche top: −2 °C, el NO sopla a 40 km/h pero el parapeto te cubre, luna nueva para ver estrellas.» */
export function phrase(s: NightStats, sc: Score, night: Date): string {
  const parts: string[] = []
  parts.push(t(s.tmin) + (!sc.shelter.covered && s.tmin - s.feels >= 3 ? ` (sensación ${t(s.feels)})` : ''))

  if (s.windMean < 12 && s.gustMax < 30) parts.push('casi sin viento')
  else {
    const w = `el ${compass(s.dir)} sopla a ${Math.round(s.windMean)} km/h`
    if (sc.shelter.wind <= 0.35) parts.push(`${w} pero ${sc.shelter.label}`)
    else if (s.windMean >= 20 && sc.shelter.wind >= 0.9) parts.push(`${w} y te da de lleno`)
    else parts.push(w)
  }

  if (s.thunder) parts.push('riesgo de tormenta')
  else if (s.snow >= 1) parts.push(`nieve (${Math.round(s.snow)} cm)${sc.shelter.rain <= 0.1 ? ', pero vais cubiertos' : ''}`)
  else if (s.precip >= 1) parts.push(`lluvia (${Math.round(s.precip)} mm)${sc.shelter.rain <= 0.1 ? ', pero vais cubiertos' : ''}`)

  const moon = moonInfo(night)
  if (s.cloud < 30 && moon.fraction < 0.3) parts.push(`${moon.name} para ver estrellas`)
  else if (s.cloud > 80) parts.push('cielo cubierto')
  else if (s.cloud < 30) parts.push(`cielo despejado con ${moon.name}`)

  return `${headline(sc.score)}: ${parts.join(', ')}.`
}

export function confidence(s: NightStats): { label: 'alta' | 'media' | 'baja'; text: string } {
  if (s.models < 2) return { label: 'media', text: 'Solo un modelo meteorológico disponible' }
  if (s.spread <= 1.5) return { label: 'alta', text: `${s.models} modelos de acuerdo` }
  if (s.spread <= 3.5) return { label: 'media', text: `${s.models} modelos difieren ${s.spread.toFixed(1)} °C` }
  return { label: 'baja', text: `Los ${s.models} modelos difieren ${s.spread.toFixed(0)} °C: mira la previsión de nuevo antes de salir` }
}
