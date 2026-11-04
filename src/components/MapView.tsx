import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { StyleSpecification } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'

maplibregl.setWorkerUrl(workerUrl)
import { KIND_COLOR, type Place } from '../lib/types'

export type BaseLayer = 'ign' | 'mtn' | 'pnoa'

const wmts = (layer: string, server: string) =>
  `https://www.ign.es/wmts/${server}?service=WMTS&request=GetTile&version=1.0.0&layer=${layer}&style=default&tilematrixset=GoogleMapsCompatible&format=image/jpeg&tilematrix={z}&tilerow={y}&tilecol={x}`

const style: StyleSpecification = {
  version: 8,
  sources: {
    ign: { type: 'raster', tiles: [wmts('IGNBaseTodo', 'ign-base')], tileSize: 256, maxzoom: 19, attribution: '© IGN' },
    mtn: { type: 'raster', tiles: [wmts('MTN', 'mapa-raster')], tileSize: 256, maxzoom: 17, attribution: '© IGN MTN' },
    pnoa: { type: 'raster', tiles: [wmts('OI.OrthoimageCoverage', 'pnoa-ma')], tileSize: 256, maxzoom: 19, attribution: '© PNOA IGN' },
    demShade: {
      type: 'raster-dem',
      tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
      encoding: 'terrarium',
      tileSize: 256,
      maxzoom: 13,
    },
    dem: {
      type: 'raster-dem',
      tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
      encoding: 'terrarium',
      tileSize: 256,
      maxzoom: 14,
      attribution: 'Terrain Tiles AWS',
    },
  },
  layers: [
    { id: 'ign', type: 'raster', source: 'ign' },
    { id: 'mtn', type: 'raster', source: 'mtn', layout: { visibility: 'none' } },
    { id: 'pnoa', type: 'raster', source: 'pnoa', layout: { visibility: 'none' } },
    {
      id: 'hillshade',
      type: 'hillshade',
      source: 'demShade',
      paint: { 'hillshade-exaggeration': 0.35, 'hillshade-shadow-color': '#1b2c44', 'hillshade-highlight-color': '#fff7e6' },
    },
  ],
  sky: {
    'sky-color': '#7fb0e0',
    'horizon-color': '#f6e6cf',
    'fog-color': '#f6e6cf',
    'sky-horizon-blend': 0.6,
    'horizon-fog-blend': 0.7,
    'fog-ground-blend': 0.3,
    'atmosphere-blend': 0.8,
  },
  terrain: { source: 'dem', exaggeration: 1.3 },
}

const EMOJI: Record<string, string> = {
  refugio_libre: '🛖', refugio_pago: '€', parapeto: '🧱', abrigo: '🪨',
  vivac: '⛺', deseo: '⭐', fuente: '💧', parking: 'P',
}

interface Props {
  places: Place[]
  selectedId?: string | null
  onSelect: (p: Place) => void
  is3D: boolean
  layer: BaseLayer
}

export default function MapView({ places, selectedId, onSelect, is3D, layer }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const markers = useRef<maplibregl.Marker[]>([])
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  useEffect(() => {
    if (!el.current) return
    const m = new maplibregl.Map({
      container: el.current,
      style,
      center: [-3.97, 40.8],
      zoom: 10.2,
      pitch: 55,
      bearing: -15,
      maxPitch: 80,
    })
    m.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left')
    m.addControl(new maplibregl.GeolocateControl({ trackUserLocation: true, positionOptions: { enableHighAccuracy: true } }), 'bottom-right')
    map.current = m
    return () => { m.remove(); map.current = null }
  }, [])

  useEffect(() => {
    const m = map.current
    if (!m) return
    const apply = () => {
      for (const id of ['ign', 'mtn', 'pnoa']) m.setLayoutProperty(id, 'visibility', id === layer ? 'visible' : 'none')
    }
    if (m.isStyleLoaded()) apply()
    else m.once('load', apply)
  }, [layer])

  useEffect(() => {
    const m = map.current
    if (!m) return
    const run = () => {
      m.easeTo({ pitch: is3D ? 60 : 0, bearing: is3D ? m.getBearing() : 0, duration: 700 })
      m.setTerrain(is3D ? { source: 'dem', exaggeration: 1.3 } : null)
    }
    if (m.isStyleLoaded()) run()
    else m.once('load', run)
  }, [is3D])

  useEffect(() => {
    const m = map.current
    if (!m) return
    markers.current.forEach((k) => k.remove())
    markers.current = places.map((p) => {
      const b = document.createElement('button')
      b.setAttribute('aria-label', p.name)
      b.style.cssText = `width:40px;height:40px;border-radius:9999px;border:2px solid #fff;box-shadow:0 4px 10px rgba(0,0,0,.3);color:#fff;font-weight:700;font-size:18px;background:${KIND_COLOR[p.kind]}`
      b.textContent = EMOJI[p.kind]
      b.addEventListener('click', (e) => { e.stopPropagation(); onSelectRef.current(p) })
      return new maplibregl.Marker({ element: b }).setLngLat([p.lng, p.lat]).addTo(m)
    })
  }, [places])

  useEffect(() => {
    const p = places.find((x) => x.id === selectedId)
    if (p && map.current) map.current.flyTo({ center: [p.lng, p.lat], zoom: 14.5, pitch: 62, speed: 0.8, essential: true })
  }, [selectedId, places])

  return <div ref={el} style={{ position: "absolute", inset: 0 }} />
}
