import type { Cat } from './pack'

export interface CatalogItem { name: string; cat: Cat; weightG: number; value?: number | null; tag?: string; shared?: boolean; why: string }

/**
 * Material típico (pesos orientativos). El valor de un saco es su temperatura de confort en °C; el de un aislante, su valor R;
 * en forros y fundas, los °C que añaden. Ajusta los pesos a tu material real al apuntarlo.
 */
export const CATALOG: Record<string, CatalogItem> = {
  sacoVerano: { name: 'Saco de verano (confort 8 °C)', cat: 'saco', weightG: 700, value: 8, why: 'Para noches templadas.' },
  sacoTres: { name: 'Saco de 3 estaciones (confort 0 °C)', cat: 'saco', weightG: 1100, value: 0, why: 'El saco comodín para primavera y otoño.' },
  sacoInvierno: { name: 'Saco de invierno (confort −8 °C)', cat: 'saco', weightG: 1700, value: -8, why: 'Para helada seria en la sierra.' },
  forro: { name: 'Forro térmico de saco', cat: 'saco', weightG: 300, value: 4, tag: 'forro', why: 'Suma unos 4 °C al saco y se puede quitar.' },
  isoR2: { name: 'Esterilla de espuma (R 2)', cat: 'aislante', weightG: 400, value: 2, why: 'Barata y a prueba de pinchazos.' },
  isoR4: { name: 'Aislante hinchable (R 4)', cat: 'aislante', weightG: 550, value: 4, why: 'Corta el frío del suelo.' },
  isoR6: { name: 'Aislante hinchable de invierno (R 6)', cat: 'aislante', weightG: 800, value: 6, why: 'Para nieve y suelo helado.' },
  funda: { name: 'Funda de vivac impermeable', cat: 'refugio', weightG: 450, value: 2, tag: 'funda', why: 'Corta el viento y la humedad; suma unos 2 °C.' },
  tarp: { name: 'Tarp (lona) con cuerdas', cat: 'refugio', weightG: 500, shared: true, why: 'Techo ligero para la lluvia.' },
  baseSup: { name: 'Camiseta térmica', cat: 'ropa', weightG: 180, tag: 'base', why: 'Ropa seca para dormir.' },
  baseInf: { name: 'Mallas térmicas', cat: 'ropa', weightG: 200, tag: 'base', why: 'Capa base de las piernas.' },
  forroPol: { name: 'Forro polar', cat: 'ropa', weightG: 400, tag: 'medio', why: 'Capa de abrigo para la cena.' },
  plumas: { name: 'Chaqueta de plumas', cat: 'ropa', weightG: 450, tag: 'plumas', why: 'La capa que más abriga por gramo.' },
  cortavientos: { name: 'Cortavientos impermeable', cat: 'ropa', weightG: 350, tag: 'cortavientos', why: 'Corta viento y lluvia.' },
  gorro: { name: 'Gorro de lana', cat: 'ropa', weightG: 70, tag: 'gorro', why: 'Por la cabeza se va mucho calor.' },
  guantes: { name: 'Guantes', cat: 'ropa', weightG: 120, tag: 'guantes', why: 'Manos con frío no montan nada.' },
  calcetines: { name: 'Calcetines secos de dormir', cat: 'ropa', weightG: 80, why: 'Nunca duermas con los de caminar.' },
  hornillo: { name: 'Hornillo y cazo', cat: 'cocina', weightG: 600, shared: true, why: 'Material común: agua caliente y cena.' },
  gasInv: { name: 'Gas de invierno (mezcla propano/isobutano)', cat: 'cocina', weightG: 450, shared: true, why: 'El gas normal no arranca con helada.' },
  botella: { name: 'Botella de agua caliente (la de dormir)', cat: 'cocina', weightG: 150, why: 'Metida en el saco calienta toda la noche.' },
  termo: { name: 'Termo', cat: 'cocina', weightG: 400, why: 'Bebida caliente a las 7 de la mañana.' },
  frontal: { name: 'Frontal con pilas nuevas', cat: 'luz', weightG: 90, why: 'Anochece pronto.' },
  pilasLitio: { name: 'Pilas de litio de repuesto', cat: 'luz', weightG: 60, why: 'Las alcalinas mueren con el frío; las de litio aguantan.' },
  bateria: { name: 'Batería externa', cat: 'luz', weightG: 250, why: 'El frío gasta el móvil; duerme con él en el saco.' },
  crampones: { name: 'Crampones y polainas', cat: 'invierno', weightG: 900, why: 'Con nieve dura o hielo en el sendero.' },
  raquetas: { name: 'Raquetas de nieve', cat: 'invierno', weightG: 1900, why: 'Con nieve blanda de más de 30 cm.' },
  manta: { name: 'Manta térmica de emergencia', cat: 'invierno', weightG: 90, why: 'Pesa nada y puede salvar una noche.' },
  botiquin: { name: 'Botiquín básico', cat: 'otro', weightG: 250, shared: true, why: 'Ampollas, torceduras y frío.' },
  mapaPapel: { name: 'Mapa y brújula', cat: 'otro', weightG: 120, why: 'No dependas solo del móvil.' },
}

export interface Template { id: string; label: string; emoji: string; desc: string; items: string[] }
export const TEMPLATES: Template[] = [
  { id: 'inv-vivac', label: 'Invierno vivac', emoji: '🏔️', desc: 'Al raso o en parapeto con helada', items: ['sacoInvierno', 'forro', 'isoR6', 'isoR2', 'funda', 'baseSup', 'baseInf', 'forroPol', 'plumas', 'cortavientos', 'gorro', 'guantes', 'calcetines', 'hornillo', 'gasInv', 'botella', 'termo', 'frontal', 'pilasLitio', 'bateria', 'crampones', 'manta', 'botiquin', 'mapaPapel'] },
  { id: 'inv-refugio', label: 'Invierno refugio', emoji: '🛖', desc: 'Con techo: chozo, búnker o refugio', items: ['sacoTres', 'forro', 'isoR4', 'baseSup', 'forroPol', 'plumas', 'cortavientos', 'gorro', 'guantes', 'calcetines', 'hornillo', 'gasInv', 'botella', 'frontal', 'pilasLitio', 'bateria', 'manta', 'botiquin', 'mapaPapel'] },
  { id: 'verano', label: 'Verano', emoji: '☀️', desc: 'Noches templadas', items: ['sacoVerano', 'isoR2', 'baseSup', 'cortavientos', 'calcetines', 'hornillo', 'frontal', 'bateria', 'botiquin', 'mapaPapel'] },
]
