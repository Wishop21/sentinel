/**
 * SENTINEL — Globe
 * deck.gl WebGL globe with world base layer, aircraft, vessels, satellites.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import DeckGL from '@deck.gl/react'
import { ScatterplotLayer, SolidPolygonLayer } from '@deck.gl/layers'
import { _GlobeView as GlobeView } from '@deck.gl/core'
import useStore from '../store'
import * as satellite from 'satellite.js'
import { LineLayer } from '@deck.gl/layers'

const INITIAL_VIEW_STATE = {
  longitude: 0,
  latitude: 20,
  zoom: 0.8,
}

const COLORS = {
  aircraft:  [245, 166, 35],
  vessel:    [0,   212, 212],
  satellite: [168, 85,  247],
}

export default function Globe() {
  const layers_toggle   = useStore(s => s.layers)
  const focusedAsset    = useStore(s => s.focusedAsset)
  const setFocusedAsset = useStore(s => s.setFocusedAsset)
  const clearFocus      = useStore(s => s.clearFocus)

  const rawAircraft        = useStore(s => s.aircraft)
  const rawVessels         = useStore(s => s.vessels)
  const rawSatellites      = useStore(s => s.satellites)
  const classFilter        = useStore(s => s.classificationFilter)
  const satGroupFilter     = useStore(s => s.satelliteGroupFilter)

  const aircraft   = useMemo(() =>
    classFilter ? rawAircraft.filter(a => (a.classification ?? 'unknown') === classFilter) : rawAircraft,
    [rawAircraft, classFilter]
  )

  const vessels    = useMemo(() =>
    classFilter ? rawVessels.filter(v => (v.classification ?? 'unknown') === classFilter) : rawVessels,
    [rawVessels, classFilter]
  )

  const satellites = useMemo(() => {
    let result = rawSatellites
    if (classFilter)    result = result.filter(s => (s.classification ?? 'unknown') === classFilter)
    if (satGroupFilter) result = result.filter(s => s.group === satGroupFilter)
    return result
  }, [rawSatellites, classFilter, satGroupFilter])

  // Orbit Computation Function
  function computeOrbitPath(tle1, tle2, minutesAhead = 95, steps = 120) {
    try {
      const satrec = satellite.twoline2satrec(tle1, tle2)
      const points = []
      const now = new Date()
      
      for (let i = 0; i <= steps; i++) {
        const t = new Date(now.getTime() + (i / steps) * minutesAhead * 60000)
        const posVel = satellite.propagate(satrec, t)
        if (!posVel.position) continue
        const gmst = satellite.gstime(t)
        const geo = satellite.eciToGeodetic(posVel.position, gmst)
        const lon = satellite.degreesLong(geo.longitude)
        const lat = satellite.degreesLat(geo.latitude)
        const alt = geo.height * 1000
        if (isFinite(lon) && isFinite(lat) && isFinite(alt)) {
          points.push([lon, lat, alt])
        }
      }
      return points
    } catch {
      return []
    }
  }

  // World GeoJSON for base layer
  const [worldData, setWorldData] = useState(null)

  useEffect(() => {
    fetch('https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_110m_land.geojson')
      .then(r => r.json())
      .then(data => setWorldData(data.features))
      .catch(e => console.warn('World GeoJSON fetch failed:', e))
  }, [])

  // ESC to dismiss focus
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') clearFocus() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [clearFocus])

  const isFocused = !!focusedAsset
  const dimAlpha  = 25
  const fullAlpha = 210

  const handleClick = useCallback((info, type) => {
    if (!info.object) return
    setFocusedAsset({
      id: info.object.icao24 || info.object.mmsi || info.object.name,
      type,
      data: info.object,
      screenX: info.x,
      screenY: info.y,
    })
  }, [setFocusedAsset])

  // ── World base layer ─────────────────────────────────────
  const worldLayer = useMemo(() => {
    if (!worldData) return null
    return new SolidPolygonLayer({
      id: 'world-land',
      data: worldData,
      getPolygon: d => {
        const geom = d.geometry
        if (geom.type === 'Polygon') return geom.coordinates
        if (geom.type === 'MultiPolygon') return geom.coordinates[0]
        return []
      },
      getFillColor: [22, 33, 50],
      getLineColor: [42, 63, 95],
      lineWidthMinPixels: 0.5,
      stroked: true,
      filled: true,
      pickable: false,
    })
  }, [worldData])

  // ── Aircraft layer ────────────────────────────────────────
  const aircraftLayer = useMemo(() => {
    if (!layers_toggle.aircraft || !aircraft.length) return null
    return new ScatterplotLayer({
      id: 'aircraft',
      data: aircraft,
      getPosition: d => [d.lon ?? 0, d.lat ?? 0, (d.baro_altitude ?? 0)],
      getRadius: 30000,
      getFillColor: d => {
        const alpha = isFocused ? (focusedAsset?.id === d.icao24 ? fullAlpha : dimAlpha) : fullAlpha
        return [...COLORS.aircraft, alpha]
      },
      pickable: true,
      onClick: info => handleClick(info, 'aircraft'),
      updateTriggers: { getFillColor: [focusedAsset?.id, isFocused] },
      transitions: { getFillColor: 200 },
    })
  }, [aircraft, layers_toggle.aircraft, focusedAsset, isFocused, handleClick])

  // ── Vessel layer ──────────────────────────────────────────
  const vesselLayer = useMemo(() => {
    if (!layers_toggle.vessels || !vessels.length) return null
    return new ScatterplotLayer({
      id: 'vessels',
      data: vessels,
      getPosition: d => [d.lon ?? 0, d.lat ?? 0, 0],
      getRadius: 40000,
      getFillColor: d => {
        const alpha = isFocused ? (focusedAsset?.id === d.mmsi ? fullAlpha : dimAlpha) : fullAlpha
        return [...COLORS.vessel, alpha]
      },
      pickable: true,
      onClick: info => handleClick(info, 'vessel'),
      updateTriggers: { getFillColor: [focusedAsset?.id, isFocused] },
      transitions: { getFillColor: 200 },
    })
  }, [vessels, layers_toggle.vessels, focusedAsset, isFocused, handleClick])

  // ── Satellite layer ───────────────────────────────────────
  const satelliteLayer = useMemo(() => {
    if (!layers_toggle.satellites || !satellites.length) return null
    return new ScatterplotLayer({
      id: 'satellites',
      data: satellites,
      getPosition: d => [d.lon ?? 0, d.lat ?? 0, (d.altitude_km ?? 0) * 1000],
      getRadius: 50000,
      getFillColor: d => {
        const alpha = isFocused ? (focusedAsset?.id === d.name ? fullAlpha : dimAlpha) : fullAlpha
        return [...COLORS.satellite, alpha]
      },
      pickable: true,
      onClick: info => handleClick(info, 'satellite'),
      updateTriggers: { getFillColor: [focusedAsset?.id, isFocused] },
      transitions: { getFillColor: 200 },
    })
  }, [satellites, layers_toggle.satellites, focusedAsset, isFocused, handleClick])

  // Orbit path for focused satellite
  const orbitPath = useMemo(() => {
    if (!focusedAsset || focusedAsset.type !== 'satellite') return null
    const { tle1, tle2 } = focusedAsset.data
    if (!tle1 || !tle2) return null
    const points = computeOrbitPath(tle1, tle2)
    if (points.length < 2) return null
    
    // Build line segments from consecutive points
    const segments = []
    for (let i = 0; i < points.length - 1; i++) {
      segments.push({ from: points[i], to: points[i + 1] })
    }
    return segments
  }, [focusedAsset])

  const orbitLayer = useMemo(() => {
    if (!orbitPath) return null
    return new LineLayer({
      id: 'orbit-path',
      data: orbitPath,
      getSourcePosition: d => d.from,
      getTargetPosition: d => d.to,
      getColor: [168, 85, 247, 60],
      getWidth: 1.5,
      widthMinPixels: 1,
      pickable: false,
    })
  }, [orbitPath])

  const deckLayers = [worldLayer, orbitLayer, aircraftLayer, vesselLayer, satelliteLayer].filter(Boolean)

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <DeckGL
        views={new GlobeView()}
        initialViewState={INITIAL_VIEW_STATE}
        controller={true}
        layers={deckLayers}
        onClick={info => { if (!info.object) clearFocus() }}
        parameters={{ clearColor: [0.031, 0.047, 0.078, 1] }}
      />
    </div>
  )
}
