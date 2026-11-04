import { useEffect, useState } from 'react'
import type { Place } from './types'

/** Catálogo de la sierra (OpenStreetMap + fuentes). Se guarda con la app para usarlo sin cobertura. */
export function useCatalog(): Place[] {
  const [items, setItems] = useState<Place[]>([])
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/places.json`)
      .then((r) => r.json())
      .then(setItems)
      .catch(() => setItems([]))
  }, [])
  return items
}
