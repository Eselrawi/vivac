import { useEffect, useState } from 'react'
import type { Place } from './types'

/** Catálogo de la sierra (OpenStreetMap + fuentes). Se guarda con la app para usarlo sin cobertura. */
export function useCatalog(): Place[] {
  const [items, setItems] = useState<Place[]>([])
  useEffect(() => {
    const base = import.meta.env.BASE_URL
    Promise.all([fetch(`${base}data/places.json`).then((r) => r.json()), fetch(`${base}data/discover.json`).then((r) => r.json()).catch(() => [])])
      .then(([a, b]) => setItems([...a, ...b]))
      .catch(() => setItems([]))
  }, [])
  return items
}
