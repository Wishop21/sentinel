/**
 * SENTINEL — Globe
 * Features:
 *   - Directional aircraft icons (rotated by true_track)
 *   - Military vs civilian aircraft distinction
 *   - Directional vessel icons (rotated by heading)
 *   - Fading trail lines for aircraft and vessels
 *   - Satellite cross icons (no rotation)
 *   - Altitude-based colour coding on aircraft
 *   - Orbit paths on focused satellite
 *   - Camera HUD (lat/lon/altitude)
 *   - Click-to-focus with dimming
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import DeckGL from '@deck.gl/react'
import { ScatterplotLayer, LineLayer, IconLayer, GeoJsonLayer } from '@deck.gl/layers'
import { SolidPolygonLayer } from '@deck.gl/layers'
import { _GlobeView as GlobeView } from '@deck.gl/core'
import * as satellite from 'satellite.js'
import useStore from '../store'
import { ICON_ATLAS, getAircraftIcon, getAircraftColor, getVesselColor } from '../layers/icons'
import { fetchMilitaryBases, getMilitaryBaseColor } from '../layers/militaryBases'

// ── Constants ────────────────────────────────────────────────
const INITIAL_VIEW_STATE = {
  longitude: 0,
  latitude: 20,
  zoom: 0.8,
}

// ── Camera HUD ───────────────────────────────────────────────
function CameraHUD({ viewState }) {
  const lat   = viewState?.latitude?.toFixed(4)  ?? '—'
  const lon   = viewState?.longitude?.toFixed(4) ?? '—'
  const altKm = Math.round(40000 / Math.pow(2, viewState?.zoom ?? 0))

  return (
    <div style={{
      position: 'absolute', bottom: 24, left: 280,
      fontFamily: 'var(--font-mono)', fontSize: 11,
      color: 'var(--text-secondary)',
      background: 'rgba(8, 12, 20, 0.7)',
      border: '1px solid var(--border-dim)',
      borderRadius: 'var(--radius)', padding: '6px 12px',
      display: 'flex', gap: 20,
      backdropFilter: 'blur(8px)', pointerEvents: 'none', zIndex: 10,
    }}>
      <span><span style={{ color: 'var(--text-dim)', marginRight: 5 }}>LAT</span>{lat}°</span>
      <span><span style={{ color: 'var(--text-dim)', marginRight: 5 }}>LON</span>{lon}°</span>
      <span><span style={{ color: 'var(--text-dim)', marginRight: 5 }}>ALT</span>{altKm.toLocaleString()} km</span>
    </div>
  )
}

// ── Orbit computation ────────────────────────────────────────
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
  } catch { return [] }
}

// ── Build trail segments from position history ────────────────
function buildTrails(historyMap, alpha = 180) {
  const segments = []
  for (const [id, positions] of historyMap) {
    if (positions.length < 2) continue
    for (let i = 1; i < positions.length; i++) {
      const prev = positions[i - 1]
      const curr = positions[i]
      // Fade: older segments are more transparent
      const fade = i / positions.length
      segments.push({
        from:  [prev.lon, prev.lat, prev.alt ?? 0],
        to:    [curr.lon, curr.lat, curr.alt ?? 0],
        alpha: Math.round(fade * alpha),
      })
    }
  }
  return segments
}

// ── Main Globe component ─────────────────────────────────────
export default function Globe() {
  const layers_toggle   = useStore(s => s.layers)
  const focusedAsset    = useStore(s => s.focusedAsset)
  const setFocusedAsset = useStore(s => s.setFocusedAsset)
  const clearFocus      = useStore(s => s.clearFocus)

  const rawAircraft    = useStore(s => s.aircraft)
  const rawVessels     = useStore(s => s.vessels)
  const rawSatellites  = useStore(s => s.satellites)
  const classFilter    = useStore(s => s.classificationFilter)
  const satGroupFilter = useStore(s => s.satelliteGroupFilter)
  const posHistory     = useStore(s => s.positionHistory)

  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE)
  const [worldData, setWorldData] = useState(null)
  const [bordersData, setBordersData] = useState(null)

  // Military bases — loaded from store, fetched on first toggle
  const militaryBases          = useStore(s => s.militaryBases)
  const setMilitaryBases       = useStore(s => s.setMilitaryBases)
  const militaryBasesLoaded    = useStore(s => s.militaryBasesLoaded)
  const setMilitaryBasesLoaded = useStore(s => s.setMilitaryBasesLoaded)

  const anyMilLayerOn = layers_toggle.mil_airfields || layers_toggle.mil_naval ||
    layers_toggle.mil_bases || layers_toggle.mil_barracks ||
    layers_toggle.mil_missiles || layers_toggle.mil_training
  useEffect(() => {
    if (!anyMilLayerOn || militaryBasesLoaded) return
    fetchMilitaryBases().then(data => {
      setMilitaryBases(data)
      setMilitaryBasesLoaded(true)
    })
  }, [anyMilLayerOn])

  // Filtered data
  const aircraft = useMemo(() =>
    classFilter ? rawAircraft.filter(a => (a.classification ?? 'unknown') === classFilter) : rawAircraft,
    [rawAircraft, classFilter]
  )
  const vessels = useMemo(() =>
    classFilter ? rawVessels.filter(v => (v.classification ?? 'unknown') === classFilter) : rawVessels,
    [rawVessels, classFilter]
  )
  const satellites = useMemo(() => {
    let result = rawSatellites
    if (classFilter)    result = result.filter(s => (s.classification ?? 'unknown') === classFilter)
    if (satGroupFilter) result = result.filter(s => s.group === satGroupFilter)
    return result
  }, [rawSatellites, classFilter, satGroupFilter])

  // Fetch world GeoJSON once
  useEffect(() => {
    fetch('https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_110m_land.geojson')
      .then(r => r.json())
      .then(data => setWorldData(data.features))
      .catch(e => console.warn('World GeoJSON fetch failed:', e))
  }, [])

  // Fetch borders GeoJSON once
  useEffect(() => {
    fetch('https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_110m_admin_0_boundary_lines_land.geojson')
      .then(r => r.json())
      .then(data => setBordersData(data.features))
      .catch(e => console.warn('Borders GeoJSON fetch failed:', e))
  }, [])

  // ESC to dismiss focus
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') clearFocus() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [clearFocus])

  const isFocused = !!focusedAsset
  const dimAlpha  = 20
  const fullAlpha = 220

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

  // ── World base layer ──────────────────────────────────────
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
      stroked: true, filled: true, pickable: false,
    })
  }, [worldData])

  // ── Aircraft trail layer ──────────────────────────────────
  const aircraftTrailLayer = useMemo(() => {
    if (!layers_toggle.aircraft || isFocused) return null
    const segments = buildTrails(posHistory.aircraft, 140)
    if (!segments.length) return null
    return new LineLayer({
      id: 'aircraft-trails',
      data: segments,
      getSourcePosition: d => d.from,
      getTargetPosition: d => d.to,
      getColor: d => [245, 166, 35, d.alpha],
      getWidth: 1,
      widthMinPixels: 1,
      pickable: false,
    })
  }, [posHistory.aircraft, layers_toggle.aircraft, isFocused])

  // ── Aircraft icon layer ───────────────────────────────────
  const aircraftLayer = useMemo(() => {
    if (!layers_toggle.aircraft || !aircraft.length) return null
    return new IconLayer({
      id: 'aircraft',
      data: aircraft,
      getPosition: d => [d.lon ?? 0, d.lat ?? 0, d.baro_altitude ?? 0],
      getIcon: d => ({
        ...ICON_ATLAS[getAircraftIcon(d)],
      }),
      getSize: 20,
      getAngle: d => -(d.true_track ?? 0),  // deck.gl angle is counter-clockwise
      getColor: d => {
        const base = getAircraftColor(d)
        const alpha = isFocused ? (focusedAsset?.id === d.icao24 ? fullAlpha : dimAlpha) : fullAlpha
        return [...base, alpha]
      },
      pickable: true,
      onClick: info => handleClick(info, 'aircraft'),
      billboard: true,
      alphaCutoff: 0.05,
      updateTriggers: {
        getColor: [focusedAsset?.id, isFocused],
        getAngle: [aircraft],
      },
      transitions: { getColor: 200 },
    })
  }, [aircraft, layers_toggle.aircraft, focusedAsset, isFocused, handleClick])

  // ── Vessel trail layer ────────────────────────────────────
  const vesselTrailLayer = useMemo(() => {
    if (!layers_toggle.vessels || isFocused) return null
    const segments = buildTrails(posHistory.vessels, 120)
    if (!segments.length) return null
    return new LineLayer({
      id: 'vessel-trails',
      data: segments,
      getSourcePosition: d => d.from,
      getTargetPosition: d => d.to,
      getColor: d => [0, 212, 212, d.alpha],
      getWidth: 1,
      widthMinPixels: 1,
      pickable: false,
    })
  }, [posHistory.vessels, layers_toggle.vessels, isFocused])

  // ── Vessel icon layer ─────────────────────────────────────
  const vesselLayer = useMemo(() => {
    if (!layers_toggle.vessels || !vessels.length) return null
    return new IconLayer({
      id: 'vessels',
      data: vessels,
      getPosition: d => [d.lon ?? 0, d.lat ?? 0, 0],
      getIcon: () => ({ ...ICON_ATLAS.ship }),
      getSize: 18,
      getAngle: d => -(d.heading ?? 0),
      getColor: d => {
        const base = getVesselColor(d)
        const alpha = isFocused ? (focusedAsset?.id === d.mmsi ? fullAlpha : dimAlpha) : fullAlpha
        return [...base, alpha]
      },
      pickable: true,
      onClick: info => handleClick(info, 'vessel'),
      billboard: true,
      alphaCutoff: 0.05,
      updateTriggers: {
        getColor: [focusedAsset?.id, isFocused],
        getAngle: [vessels],
      },
      transitions: { getColor: 200 },
    })
  }, [vessels, layers_toggle.vessels, focusedAsset, isFocused, handleClick])

  // ── Satellite layer (ScatterplotLayer — no direction needed) ──
  const satelliteLayer = useMemo(() => {
    if (!layers_toggle.satellites || !satellites.length) return null
    return new IconLayer({
      id: 'satellites',
      data: satellites,
      getPosition: d => [d.lon ?? 0, d.lat ?? 0, (d.altitude_km ?? 0) * 1000],
      getIcon: () => ({ ...ICON_ATLAS.satellite }),
      getSize: 16,
      getAngle: 0,
      getColor: d => {
        const alpha = isFocused ? (focusedAsset?.id === d.name ? fullAlpha : dimAlpha) : fullAlpha
        return [168, 85, 247, alpha]
      },
      pickable: true,
      onClick: info => handleClick(info, 'satellite'),
      billboard: true,
      alphaCutoff: 0.05,
      updateTriggers: { getColor: [focusedAsset?.id, isFocused] },
      transitions: { getColor: 200 },
    })
  }, [satellites, layers_toggle.satellites, focusedAsset, isFocused, handleClick])

  // ── Orbit path (focused satellite) ───────────────────────
  const orbitPath = useMemo(() => {
    if (!focusedAsset || focusedAsset.type !== 'satellite') return null
    const { tle1, tle2 } = focusedAsset.data
    if (!tle1 || !tle2) return null
    const points = computeOrbitPath(tle1, tle2)
    if (points.length < 2) return null
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

  // ── Borders layer ─────────────────────────────────────────
  const bordersLayer = useMemo(() => {
    if (!layers_toggle.borders || !bordersData) return null
    return new GeoJsonLayer({
      id: 'borders',
      data: { type: 'FeatureCollection', features: bordersData },
      stroked: true,
      filled: false,
      getLineColor: [60, 90, 130, 160],
      getLineWidth: 1,
      lineWidthMinPixels: 0.5,
      lineWidthMaxPixels: 1.5,
      pickable: false,
    })
  }, [bordersData, layers_toggle.borders])

  // ── Military bases layer ──────────────────────────────────
  const militaryBasesLayer = useMemo(() => {
    const anyOn = layers_toggle.mil_airfields || layers_toggle.mil_naval ||
      layers_toggle.mil_bases || layers_toggle.mil_barracks ||
      layers_toggle.mil_missiles || layers_toggle.mil_training
    if (!anyOn || !militaryBases.length) return null

    const filtered = militaryBases.filter(b => {
      if (layers_toggle.mil_airfields && b.type === 'airfield') return true
      if (layers_toggle.mil_naval && (b.type === 'naval_base' || b.type === 'harbour')) return true
      if (layers_toggle.mil_bases && b.type === 'base') return true
      if (layers_toggle.mil_barracks && b.type === 'barracks') return true
      if (layers_toggle.mil_missiles && b.type === 'missile_site') return true
      if (layers_toggle.mil_training && (b.type === 'training_area' || b.type === 'range')) return true
      return false
    })

    return new ScatterplotLayer({
      id: 'military-bases',
      data: filtered,
      getPosition: d => [d.lon, d.lat, 0],
      getRadius: 25000,
      getFillColor: d => {
        const [r, g, b] = getMilitaryBaseColor(d)
        return [r, g, b, isFocused ? (focusedAsset?.id === d.id ? 220 : 40) : 200]
      },
      getLineColor: d => {
        const [r, g, b] = getMilitaryBaseColor(d)
        return [r, g, b, 255]
      },
      stroked: true,
      lineWidthMinPixels: 1,
      pickable: true,
      onClick: (info) => {
        if (!info.object) return
        setFocusedAsset({
          id:      info.object.id,
          type:    'military_base',
          data:    info.object,
          screenX: info.x,
          screenY: info.y,
        })
      },
      updateTriggers: {
        getFillColor: [focusedAsset?.id, isFocused,
          layers_toggle.mil_airfields, layers_toggle.mil_naval,
          layers_toggle.mil_bases, layers_toggle.mil_barracks,
          layers_toggle.mil_missiles, layers_toggle.mil_training],
      },
    })
  }, [militaryBases, layers_toggle.mil_airfields, layers_toggle.mil_naval,
    layers_toggle.mil_bases, layers_toggle.mil_barracks,
    layers_toggle.mil_missiles, layers_toggle.mil_training,
    focusedAsset, isFocused, setFocusedAsset])

  const deckLayers = [
    worldLayer,
    bordersLayer,
    militaryBasesLayer,
    aircraftTrailLayer,
    vesselTrailLayer,
    orbitLayer,
    aircraftLayer,
    vesselLayer,
    satelliteLayer,
  ].filter(Boolean)

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <DeckGL
        views={new GlobeView()}
        initialViewState={INITIAL_VIEW_STATE}
        onViewStateChange={({ viewState: vs }) => setViewState(vs.globe ?? vs)}
        controller={true}
        layers={deckLayers}
        onClick={info => { if (!info.object) clearFocus() }}
        parameters={{ clearColor: [0.031, 0.047, 0.078, 1] }}
      />
      <CameraHUD viewState={viewState} />
    </div>
  )
}
