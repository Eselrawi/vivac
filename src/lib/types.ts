export type PlaceKind =
  | 'refugio_libre'
  | 'refugio_pago'
  | 'parapeto'
  | 'abrigo'
  | 'vivac'
  | 'deseo'
  | 'fuente'
  | 'parking'
  | 'cumbre'
  | 'candidato'

export type Shelter = 'cerrado' | 'techo' | 'parapeto' | 'raso'

export interface Place {
  id: string
  name: string
  kind: PlaceKind
  lat: number
  lng: number
  ele?: number
  shelter?: Shelter
  /** Vientos de los que está resguardado (grados desde donde sopla, 0 = N). */
  shelteredFrom?: number[]
  priceNight?: number | null
  verified: boolean
  source: string
  visited?: number
  eleDem?: boolean
  tpi?: number
  score?: number
  unnamed?: boolean
  toponym?: boolean
  capacity?: string
  web?: string
  phone?: string
}

export const KIND_LABEL: Record<PlaceKind, string> = {
  refugio_libre: 'Refugio libre',
  refugio_pago: 'Refugio de pago',
  parapeto: 'Parapeto',
  abrigo: 'Abrigo',
  vivac: 'Vivac nuestro',
  deseo: 'Deseo',
  fuente: 'Fuente',
  parking: 'Aparcamiento',
  cumbre: 'Cumbre',
  candidato: 'Sitio sugerido',
}

export const KIND_COLOR: Record<PlaceKind, string> = {
  refugio_libre: '#3f8a68',
  refugio_pago: '#e08a35',
  parapeto: '#7a6fa8',
  abrigo: '#8a6a4a',
  vivac: '#1b2c44',
  deseo: '#d1553f',
  fuente: '#3a86c8',
  parking: '#5b6472',
  cumbre: '#6b7280',
  candidato: '#9a7fd1',
}

export const SLEEP_KINDS: PlaceKind[] = ['refugio_libre', 'refugio_pago', 'parapeto', 'abrigo', 'vivac', 'deseo']

export const HOME = { name: 'Villanueva de la Cañada', lat: 40.4436, lng: -3.9944 }
