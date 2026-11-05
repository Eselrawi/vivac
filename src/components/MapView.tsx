import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { StyleSpecification, GeoJSONSource } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import type { FeatureCollection, Point } from 'geojson'
import { PMTiles, Protocol } from 'pmtiles'
import { layers as pmLayers, namedFlavor } from '@protomaps/basemaps'
import { KIND_COLOR, type Place } from '../lib/types'
import { HybridSource, PM_URL } from '../lib/vec'

maplibregl.setWorkerUrl(workerUrl)
const protocol = new Protocol()
maplibregl.addProtocol('pmtiles', protocol.tile)
protocol.add(new PMTiles(new HybridSource(PM_URL)))

export type BaseLayer = 'vec' | 'ign' | 'mtn' | 'pnoa'

// Mapa vectorial con los colores de la marca (granito, pino, agua de montaña).
const flavor = { ...namedFlavor('light'), earth: '#f3eee3', water: '#9cc7e6', park_a: '#d6e5c9', park_b: '#c9dcbc', wood_a: '#cadcbd', wood_b: '#bdd2b0', scrub_a: '#dde5c6', scrub_b: '#d2dbb9', glacier: '#f4f9fb' }
const VEC_LAYERS = pmLayers('protomaps', flavor, { lang: 'es' }).map((l) => ({ ...l, layout: { ...(l.layout ?? {}), visibility: 'visible' as const } }))
const VEC_IDS = VEC_LAYERS.map((l) => l.id)
const RASTER_IDS = ['ign', 'mtn', 'pnoa']

const wmts = (layer: string, server: string) =>
  `https://www.ign.es/wmts/${server}?service=WMTS&request=GetTile&version=1.0.0&layer=${layer}&style=default&tilematrixset=GoogleMapsCompatible&format=image/jpeg&tilematrix={z}&tilerow={y}&tilecol={x}`
const DEM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'

const style: StyleSpecification = {
  version: 8,
  glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
  sprite: 'https://protomaps.github.io/basemaps-assets/sprites/v4/light',
  sources: {
    protomaps: { type: 'vector', url: `pmtiles://${PM_URL}`, attribution: '© OpenStreetMap · Protomaps' },
    ign: { type: 'raster', tiles: [wmts('IGNBaseTodo', 'ign-base')], tileSize: 256, maxzoom: 19, attribution: '© IGN' },
    mtn: { type: 'raster', tiles: [wmts('MTN', 'mapa-raster')], tileSize: 256, maxzoom: 17, attribution: '© IGN MTN' },
    pnoa: { type: 'raster', tiles: [wmts('OI.OrthoimageCoverage', 'pnoa-ma')], tileSize: 256, maxzoom: 19, attribution: '© PNOA IGN' },
    demShade: { type: 'raster-dem', tiles: [DEM], encoding: 'terrarium', tileSize: 256, maxzoom: 13 },
    dem: { type: 'raster-dem', tiles: [DEM], encoding: 'terrarium', tileSize: 256, maxzoom: 14, attribution: 'Terrain Tiles AWS' },
  },
  layers: [
    { id: 'ign', type: 'raster', source: 'ign', layout: { visibility: 'none' } },
    { id: 'mtn', type: 'raster', source: 'mtn', layout: { visibility: 'none' } },
    { id: 'pnoa', type: 'raster', source: 'pnoa', layout: { visibility: 'none' } },
    ...VEC_LAYERS,
    { id: 'hillshade', type: 'hillshade', source: 'demShade', paint: { 'hillshade-exaggeration': 0.35, 'hillshade-shadow-color': '#1b2c44', 'hillshade-highlight-color': '#fff7e6' } },
  ],
  sky: { 'sky-color': '#7fb0e0', 'horizon-color': '#f6e6cf', 'fog-color': '#f6e6cf', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.7, 'fog-ground-blend': 0.3, 'atmosphere-blend': 0.8 },
  terrain: { source: 'dem', exaggeration: 1.3 },
}

const GLYPH: Record<string, string> = {
  refugio_libre: '🛖', refugio_pago: '€', parapeto: '🧱', abrigo: '🪨', vivac: '⛺', deseo: '⭐', fuente: '💧', parking: 'P', cumbre: '▲', candidato: '✨',
}

function addIcons(m: maplibregl.Map) {
  for (const [kind, glyph] of Object.entries(GLYPH)) {
    for (const visited of [false, true]) {
      const name = `${kind}${visited ? '-v' : ''}`
      if (m.hasImage(name)) continue
      const s = 64
      const c = document.createElement('canvas')
      c.width = c.height = s
      const g = c.getContext('2d')!
      g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 6; g.shadowOffsetY = 2
      g.beginPath(); g.arc(s / 2, s / 2, 24, 0, Math.PI * 2)
      g.fillStyle = KIND_COLOR[kind as keyof typeof KIND_COLOR] ?? '#5b6472'; g.fill()
      g.shadowColor = 'transparent'
      g.lineWidth = visited ? 6 : 4; g.strokeStyle = visited ? '#ffd9a0' : '#fff'; g.stroke()
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'
      g.font = kind === 'refugio_pago' || kind === 'parking' || kind === 'cumbre' ? 'bold 26px Inter, sans-serif' : '26px sans-serif'
      g.fillText(glyph, s / 2, s / 2 + 2)
      m.addImage(name, g.getImageData(0, 0, s, s), { pixelRatio: 2 })
    }
  }
}

const toGeo = (places: Place[], scoreMode = false): FeatureCollection => ({
  type: 'FeatureCollection',
  features: places.map((p) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
    properties: { id: p.id, name: p.name, icon: scoreMode && p.score != null ? `s${p.score}` : `${p.kind}${p.visited ? '-v' : ''}`, prio: p.kind === 'cumbre' ? 0 : p.kind === 'fuente' ? 1 : 2 },
  })),
})

interface Props {
  places: Place[]
  selectedId?: string | null
  onSelect: (p: Place) => void
  is3D: boolean
  layer: BaseLayer
  scoreMode?: boolean
  route?: [number, number, number][] | null
  cursor?: [number, number] | null
  tracks?: [number, number, number?][][]
  zones?: boolean
  onLongPress?: (lng: number, lat: number, ele: number | null) => void
}

export default function MapView({ places, selectedId, onSelect, is3D, layer, scoreMode = false, route = null, cursor = null, tracks = [], zones = false, onLongPress }: Props) {
  const longRef = useRef(onLongPress)
  longRef.current = onLongPress
  const scoreRef = useRef(scoreMode)
  scoreRef.current = scoreMode
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const ready = useRef(false)
  const queue = useRef<Array<(m: maplibregl.Map) => void>>([])
  const placesRef = useRef(places)
  placesRef.current = places
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  useEffect(() => {
    if (!el.current) return
    const m = new maplibregl.Map({ container: el.current, style, center: [-3.97, 40.8], zoom: 10.2, pitch: 55, bearing: -15, maxPitch: 80 })
    m.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left')
    m.addControl(new maplibregl.GeolocateControl({ trackUserLocation: true, positionOptions: { enableHighAccuracy: true } }), 'bottom-right')
    map.current = m
    ;(window as unknown as { __map?: unknown }).__map = m

    m.on('styleimagemissing', (e) => {
      const mm = /^s(d+)$/.exec(e.id)
      if (!mm || m.hasImage(e.id)) return
      const sc = +mm[1]
      const c = document.createElement('canvas'); c.width = c.height = 64
      const g = c.getContext('2d')!
      g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 6; g.shadowOffsetY = 2
      g.beginPath(); g.arc(32, 32, 24, 0, Math.PI * 2)
      g.fillStyle = sc >= 70 ? '#3f8a68' : sc >= 45 ? '#e5b23a' : '#d1553f'; g.fill()
      g.shadowColor = 'transparent'; g.lineWidth = 4; g.strokeStyle = '#fff'; g.stroke()
      g.fillStyle = sc >= 45 && sc < 70 ? '#14202e' : '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 24px Inter, sans-serif'
      g.fillText(String(sc), 32, 34)
      m.addImage(e.id, g.getImageData(0, 0, 64, 64), { pixelRatio: 2 })
    })
    // Mantener pulsado (o botón derecho en el ordenador) = «¿qué hay aquí?»
    let timer: ReturnType<typeof setTimeout> | null = null
    const fire = (ll: maplibregl.LngLat) => longRef.current?.(ll.lng, ll.lat, m.queryTerrainElevation(ll) ?? null)
    const clear = () => { if (timer) { clearTimeout(timer); timer = null } }
    m.on('touchstart', (e) => { clear(); if (e.originalEvent.touches.length === 1) timer = setTimeout(() => fire(e.lngLat), 650) })
    m.on('touchmove', clear); m.on('touchend', clear); m.on('touchcancel', clear); m.on('dragstart', clear); m.on('zoomstart', clear)
    m.on('contextmenu', (e) => fire(e.lngLat))
    m.on('load', () => {
      addIcons(m)
      const empty = { type: 'FeatureCollection', features: [] } as FeatureCollection
      m.addSource('route', { type: 'geojson', data: empty })
      m.addSource('tracks', { type: 'geojson', data: empty })
      m.addSource('zonas', { type: 'geojson', data: `${import.meta.env.BASE_URL}data/vivac-zonas.geojson` })
      m.addLayer({ id: 'zonas-fill', type: 'fill', source: 'zonas', layout: { visibility: 'none' }, paint: { 'fill-color': '#3f8a68', 'fill-opacity': 0.28 } })
      m.addLayer({ id: 'zonas-line', type: 'line', source: 'zonas', layout: { visibility: 'none' }, paint: { 'line-color': '#1f4d3a', 'line-width': 2.5, 'line-dasharray': [3, 2] } })
      m.addLayer({ id: 'zonas-name', type: 'symbol', source: 'zonas', minzoom: 11, layout: { visibility: 'none', 'text-field': ['concat', 'Zona de vivac: ', ['get', 'DS_ZONA']], 'text-font': ['Noto Sans Medium'], 'text-size': 12 }, paint: { 'text-color': '#1f4d3a', 'text-halo-color': '#fff', 'text-halo-width': 1.8 } })
      m.addSource('cursor', { type: 'geojson', data: empty })
      m.addLayer({ id: 'tracks', type: 'line', source: 'tracks', paint: { 'line-color': '#7a6fa8', 'line-width': 3, 'line-opacity': 0.85, 'line-dasharray': [2, 1] } })
      m.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#fff', 'line-width': 9 } })
      m.addLayer({ id: 'route', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#e08a35', 'line-width': 5 } })
      m.addLayer({ id: 'cursor', type: 'circle', source: 'cursor', paint: { 'circle-radius': 8, 'circle-color': '#1b2c44', 'circle-stroke-width': 3, 'circle-stroke-color': '#fff' } })
      m.addSource('places', { type: 'geojson', data: toGeo(placesRef.current, scoreRef.current), cluster: true, clusterRadius: 46, clusterMaxZoom: 12 })
      m.addLayer({ id: 'clusters', type: 'circle', source: 'places', filter: ['has', 'point_count'], paint: { 'circle-color': '#1f4d3a', 'circle-radius': ['step', ['get', 'point_count'], 16, 10, 20, 50, 26], 'circle-stroke-width': 3, 'circle-stroke-color': '#fff' } })
      m.addLayer({ id: 'cluster-n', type: 'symbol', source: 'places', filter: ['has', 'point_count'], layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Medium'], 'text-size': 13 }, paint: { 'text-color': '#fff' } })
      m.addLayer({
        id: 'icons', type: 'symbol', source: 'places', filter: ['!', ['has', 'point_count']],
        layout: { 'icon-image': ['get', 'icon'], 'icon-size': ['interpolate', ['linear'], ['zoom'], 8, 0.55, 13, 0.9, 16, 1.1], 'icon-allow-overlap': true, 'symbol-sort-key': ['get', 'prio'] },
      })
      m.addLayer({
        id: 'names', type: 'symbol', source: 'places', minzoom: 13, filter: ['!', ['has', 'point_count']],
        layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Medium'], 'text-size': 12, 'text-offset': [0, 1.5], 'text-anchor': 'top', 'text-optional': true },
        paint: { 'text-color': '#14202e', 'text-halo-color': '#fff', 'text-halo-width': 1.6 },
      })
      m.on('click', 'clusters', (e) => {
        const f = e.features?.[0]
        if (!f) return
        const src = m.getSource('places') as GeoJSONSource
        src.getClusterExpansionZoom(f.properties.cluster_id).then((z) => m.easeTo({ center: (f.geometry as Point).coordinates as [number, number], zoom: z + 0.5 }))
      })
      m.on('click', 'icons', (e) => {
        const id = e.features?.[0]?.properties?.id
        const p = placesRef.current.find((x) => x.id === id)
        if (p) onSelectRef.current(p)
      })
      for (const l of ['clusters', 'icons']) {
        m.on('mouseenter', l, () => (m.getCanvas().style.cursor = 'pointer'))
        m.on('mouseleave', l, () => (m.getCanvas().style.cursor = ''))
      }
      ready.current = true
      queue.current.splice(0).forEach((fn) => fn(m))
    })
    return () => { ready.current = false; m.remove(); map.current = null }
  }, [])

  const whenReady = (fn: (m: maplibregl.Map) => void) => {
    const m = map.current
    if (!m) return
    if (ready.current) fn(m)
    else queue.current.push(fn)
  }

  useEffect(() => {
    whenReady((m) => { for (const id of RASTER_IDS) m.setLayoutProperty(id, 'visibility', id === layer ? 'visible' : 'none')
      for (const id of VEC_IDS) m.setLayoutProperty(id, 'visibility', layer === 'vec' ? 'visible' : 'none') })
  }, [layer])

  useEffect(() => {
    whenReady((m) => {
      m.easeTo({ pitch: is3D ? 60 : 0, bearing: is3D ? m.getBearing() : 0, duration: 700 })
      m.setTerrain(is3D ? { source: 'dem', exaggeration: 1.3 } : null)
    })
  }, [is3D])

  useEffect(() => {
    whenReady((m) => (m.getSource('places') as GeoJSONSource | undefined)?.setData(toGeo(placesRef.current, scoreRef.current)))
  }, [places, scoreMode])

  useEffect(() => {
    whenReady((m) => {
      const line = route && route.length > 1 ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: route.map((c) => [c[0], c[1]]) } }] } : { type: 'FeatureCollection', features: [] }
      ;(m.getSource('route') as GeoJSONSource).setData(line as FeatureCollection)
      if (route && route.length > 1) {
        const xs = route.map((c) => c[0]), ys = route.map((c) => c[1])
        m.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: { top: 130, bottom: 330, left: 40, right: 40 }, duration: 900, maxZoom: 15.5 })
      }
    })
  }, [route])

  useEffect(() => {
    whenReady((m) => { for (const id of ['zonas-fill', 'zonas-line', 'zonas-name']) m.setLayoutProperty(id, 'visibility', zones ? 'visible' : 'none') })
  }, [zones])

  useEffect(() => {
    whenReady((m) => (m.getSource('cursor') as GeoJSONSource).setData({ type: 'FeatureCollection', features: cursor ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: cursor } }] : [] } as FeatureCollection))
  }, [cursor])

  useEffect(() => {
    whenReady((m) => (m.getSource('tracks') as GeoJSONSource).setData({ type: 'FeatureCollection', features: tracks.map((t) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: t.map((c) => [c[0], c[1]]) } })) } as FeatureCollection))
  }, [tracks])

  useEffect(() => {
    const p = places.find((x) => x.id === selectedId)
    if (p) whenReady((m) => m.flyTo({ center: [p.lng, p.lat], zoom: 14.5, pitch: is3D ? 62 : 0, speed: 0.8, essential: true }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  return <div ref={el} style={{ position: 'absolute', inset: 0 }} />
}
