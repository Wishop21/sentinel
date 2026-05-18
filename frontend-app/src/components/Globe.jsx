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
 * frontend-app/src/components/Globe.jsx
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import DeckGL from '@deck.gl/react'
import { ScatterplotLayer, LineLayer, IconLayer, GeoJsonLayer, SolidPolygonLayer } from '@deck.gl/layers'
import { _GlobeView as GlobeView } from '@deck.gl/core'
import * as satellite from 'satellite.js'
import useStore from '../store'
import { ICON_ATLAS, getAircraftIcon, getAircraftColor, getVesselColor } from '../layers/icons'
import { fetchMilitaryBases, getMilitaryBaseColor } from '../layers/militaryBases'
import { computeH3Density, applyDensityColors } from '../layers/h3Density'

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
function hexToRgb(hex) {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return isNaN(r) ? [0, 212, 212] : [r, g, b]
}

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

// ── Satellite horizon footprint ──────────────────────────────
// Computes the visibility footprint polygon for a satellite at a given
// altitude. The footprint is the set of surface points from which the
// satellite is above the horizon — i.e. the precondition for any
// line-of-sight contact (signal, imaging, observation).
//
// Derivation:
//   Earth central angle ρ = arccos(R / (R + h))
//   where R = Earth radius (km), h = satellite altitude (km)
//   Surface radius = R × ρ (ρ in radians)
//
// Points are computed via the haversine great-circle formula so the
// polygon is correct on a sphere — a flat lat/lon circle would be
// wrong at high latitudes.
const EARTH_RADIUS_KM = 6371

function computeFootprintPolygon(lat, lon, altitudeKm, steps = 64) {
  // Earth central angle in radians
  const rho = Math.acos(EARTH_RADIUS_KM / (EARTH_RADIUS_KM + altitudeKm))
  // Angular radius of footprint in radians (great-circle distance / R)
  const angularRadius = rho

  const latRad = lat * (Math.PI / 180)
  const lonRad = lon * (Math.PI / 180)
  const ring = []

  for (let i = 0; i <= steps; i++) {
    // Counter-clockwise bearing (negative direction) produces a
    // clockwise ring in lon/lat space, which is the correct winding
    // order for deck.gl SolidPolygonLayer to fill the disc interior
    // rather than its complement (the rest of the globe).
    const bearing = -(i / steps) * 2 * Math.PI

    // Haversine great-circle destination formula
    const sinLat = Math.sin(latRad) * Math.cos(angularRadius) +
                   Math.cos(latRad) * Math.sin(angularRadius) * Math.cos(bearing)
    const pointLat = Math.asin(Math.max(-1, Math.min(1, sinLat)))

    const y = Math.sin(bearing) * Math.sin(angularRadius) * Math.cos(latRad)
    const x = Math.cos(angularRadius) - Math.sin(latRad) * Math.sin(pointLat)
    const pointLon = lonRad + Math.atan2(y, x)

    ring.push([
      pointLon * (180 / Math.PI),
      pointLat * (180 / Math.PI),
    ])
  }

  return ring
}

// ── Build trail segments from position history ────────────────
function buildTrails(historyMap, alpha = 180) {
  const segments = []
  for (const [id, positions] of historyMap) {
    if (positions.length < 2) continue
    for (let i = 1; i < positions.length; i++) {
      const prev = positions[i - 1]
      const curr = positions[i]
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
  const selectedRegion  = useStore(s => s.selectedRegion)
  const setSelectedRegion = useStore(s => s.setSelectedRegion)
  const clearRegion     = useStore(s => s.clearRegion)
  const heatmapDomain   = useStore(s => s.heatmapDomain)

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

  // Undersea cables
  const cables          = useStore(s => s.cables)
  const setCables       = useStore(s => s.setCables)
  const cablesLoaded    = useStore(s => s.cablesLoaded)
  const setCablesLoaded = useStore(s => s.setCablesLoaded)

  useEffect(() => {
    if (!layers_toggle.cables || cablesLoaded) return
    fetch('/api/layers/undersea-cables')
      .then(r => r.json())
      .then(data => {
        setCables(data.data || [])
        setCablesLoaded(true)
      })
      .catch(e => console.warn('Cables fetch failed:', e))
  }, [layers_toggle.cables])

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

  // Fetch world GeoJSON once — used for the land fill layer
  useEffect(() => {
    fetch('https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_110m_land.geojson')
      .then(r => r.json())
      .then(data => setWorldData(data))
      .catch(e => console.warn('World GeoJSON fetch failed:', e))
  }, [])

  // Fetch borders GeoJSON once
  useEffect(() => {
    fetch('https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_110m_admin_0_boundary_lines_land.geojson')
      .then(r => r.json())
      .then(data => setBordersData(data.features))
      .catch(e => console.warn('Borders GeoJSON fetch failed:', e))
  }, [])

  // ESC to dismiss focus and region
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') {
        clearFocus()
        clearRegion()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [clearFocus, clearRegion])

  // ── Region click handler ──────────────────────────────────
  // Fires when the user clicks empty globe space (no asset under cursor).
  // Resolves the click coordinate to an H3 cell via the backend,
  // sets a loading state immediately so the panel appears, then
  // populates with results when the query returns.
  const handleRegionClick = useCallback(async (coordinate) => {
    if (!coordinate) return
    const [lon, lat] = coordinate

    // Show panel immediately with loading state
    setSelectedRegion({ loading: true, h3Index: null, boundary: null, center: { lat, lon }, stats: null })

    try {
      const res = await fetch('/api/analytics/region', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lon, resolution: 3, hours: 24 }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()

      setSelectedRegion({
        loading:  false,
        h3Index:  data.h3_index,
        boundary: data.boundary,
        center:   data.center,
        stats:    data,
      })
    } catch (e) {
      console.warn('Region query failed:', e.message)
      setSelectedRegion({ loading: false, h3Index: null, boundary: null, center: { lat, lon }, stats: null, error: e.message })
    }
  }, [setSelectedRegion])

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

  // ── Ocean base sphere ─────────────────────────────────────
  // A full-globe SolidPolygonLayer rendered first in the stack.
  // This blocks the back hemisphere from showing through — without it,
  // deck.gl's GlobeView renders country borders and land on the far
  // side of the globe as transparent bleed-through.
  // The polygon covers -180→180 lon, -90→90 lat as a single quad.
  // Colour matches the clearColor ocean background exactly.
  const oceanLayer = useMemo(() => new SolidPolygonLayer({
    id: 'ocean-base',
    data: [{ polygon: [[-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]] }],
    getPolygon: d => d.polygon,
    filled: true,
    stroked: false,
    getFillColor: [8, 12, 20],
    pickable: false,
  }), [])

  // ── World base layer ──────────────────────────────────────
  // GeoJsonLayer handles both Polygon and MultiPolygon natively,
  // fixing the previous SolidPolygonLayer bug that silently dropped
  // all polygon rings after the first in any MultiPolygon feature
  // (islands, archipelagos, complex coastlines).
  const worldLayer = useMemo(() => {
    if (!worldData) return null
    return new GeoJsonLayer({
      id: 'world-land',
      data: worldData,
      stroked: true,
      filled: true,
      getFillColor: [22, 33, 50],
      getLineColor: [42, 63, 95],
      lineWidthMinPixels: 0.5,
      pickable: false,
    })
  }, [worldData])

  // ── Aircraft trail layer ──────────────────────────────────
  // Trails are rendered independently of focus state — removing the
  // isFocused guard prevents all trails from disappearing when any
  // single asset is clicked.
  const aircraftTrailLayer = useMemo(() => {
    if (!layers_toggle.aircraft) return null
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
  }, [posHistory.aircraft, layers_toggle.aircraft])

  // ── Aircraft icon layer ───────────────────────────────────
  const aircraftLayer = useMemo(() => {
    if (!layers_toggle.aircraft || !aircraft.length) return null
    return new IconLayer({
      id: 'aircraft',
      data: aircraft,
      getPosition: d => [d.lon ?? 0, d.lat ?? 0, d.baro_altitude ?? 0],
      getIcon: d => ({ ...ICON_ATLAS[getAircraftIcon(d)] }),
      getSize: 20,
      // deck.gl angle is counter-clockwise from north; true_track is clockwise
      getAngle: d => -(d.true_track ?? 0),
      getColor: d => {
        const base = getAircraftColor(d)
        const alpha = isFocused ? (focusedAsset?.id === d.icao24 ? fullAlpha : dimAlpha) : fullAlpha
        return [...base, alpha]
      },
      pickable: true,
      onClick: info => handleClick(info, 'aircraft'),
      billboard: true,
      alphaCutoff: 0.05,
      // getAngle intentionally omitted from updateTriggers — deck.gl
      // recomputes accessors automatically when data changes, and passing
      // the full aircraft array here forced a complete GPU re-upload
      // every poll cycle regardless of what actually changed.
      updateTriggers: {
        getColor: [focusedAsset?.id, isFocused],
      },
      transitions: { getColor: 200 },
    })
  }, [aircraft, layers_toggle.aircraft, focusedAsset, isFocused, handleClick])

  // ── Vessel trail layer ────────────────────────────────────
  const vesselTrailLayer = useMemo(() => {
    if (!layers_toggle.vessels) return null
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
  }, [posHistory.vessels, layers_toggle.vessels])

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
        // getAngle omitted — recomputed automatically on data change
      },
      transitions: { getColor: 200 },
    })
  }, [vessels, layers_toggle.vessels, focusedAsset, isFocused, handleClick])

  // ── Satellite layer ───────────────────────────────────────
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

  // ── Satellite visibility footprint (focused satellite) ───────
  // Rendered as a filled disc on the Earth's surface at altitude 0.
  // The fill is intentionally low-opacity so landmass and borders
  // remain readable through it. The outline ring at higher opacity
  // marks the horizon boundary clearly.
  // Labelled "Visibility Footprint" — honest about what it represents.
  const footprintLayer = useMemo(() => {
    if (!focusedAsset || focusedAsset.type !== 'satellite') return null
    const { lat, lon, altitude_km } = focusedAsset.data
    if (lat == null || lon == null || altitude_km == null || altitude_km <= 0) return null

    const ring = computeFootprintPolygon(lat, lon, altitude_km)
    if (!ring.length) return null

    return new SolidPolygonLayer({
      id: 'satellite-footprint',
      data: [{ polygon: ring }],
      getPolygon: d => d.polygon,
      filled: true,
      stroked: true,
      getFillColor: [168, 85, 247, 12],
      getLineColor: [168, 85, 247, 100],
      getLineWidth: 1,
      lineWidthMinPixels: 1,
      pickable: false,
      // Rendered at elevation 0 — on the surface, beneath asset icons
      extruded: false,
    })
  }, [focusedAsset])

  // ── H3 density heatmap layer ──────────────────────────────
  // Computed from live asset data on every poll update.
  // Only one domain shown at a time — controlled by heatmapDomain
  // in the store. Uses square-root normalisation so moderate-density
  // cells aren't washed out by a handful of extreme hotspots.
  // Rendered below the region highlight and all asset icons.
  const heatmapLayer = useMemo(() => {
    if (!heatmapDomain) return null

    // Select the correct live dataset
    const assetMap = {
      aircraft:   { data: rawAircraft,   latKey: 'lat', lonKey: 'lon' },
      vessels:    { data: rawVessels,    latKey: 'lat', lonKey: 'lon' },
      satellites: { data: rawSatellites, latKey: 'lat', lonKey: 'lon' },
    }
    const source = assetMap[heatmapDomain]
    if (!source || !source.data.length) return null

    const density = computeH3Density(source.data, source.latKey, source.lonKey)
    const coloured = applyDensityColors(density)
    if (!coloured.length) return null

    return new SolidPolygonLayer({
      id: 'h3-heatmap',
      data: coloured,
      getPolygon: d => d.polygon,
      filled: true,
      stroked: false,
      getFillColor: d => d.color,
      pickable: false,
      extruded: false,
      // Recompute whenever the source data or selected domain changes
      updateTriggers: {
        getFillColor: [heatmapDomain, rawAircraft.length, rawVessels.length, rawSatellites.length],
      },
    })
  }, [heatmapDomain, rawAircraft, rawVessels, rawSatellites])

  // ── H3 region highlight layer ─────────────────────────────
  // Renders the selected H3 cell as a filled hex on the globe surface.
  // Uses a cyan accent distinct from the satellite footprint purple.
  // Only rendered when a region is selected and boundary data is available.
  const regionLayer = useMemo(() => {
    if (!selectedRegion?.boundary) return null
    return new SolidPolygonLayer({
      id: 'h3-region',
      data: [{ polygon: selectedRegion.boundary }],
      getPolygon: d => d.polygon,
      filled: true,
      stroked: true,
      getFillColor: [0, 212, 180, 25],
      getLineColor: [0, 212, 180, 180],
      getLineWidth: 1,
      lineWidthMinPixels: 1.5,
      pickable: false,
      extruded: false,
    })
  }, [selectedRegion?.boundary])

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

  // ── Undersea cables layer ─────────────────────────────────
  const cablesLayer = useMemo(() => {
    if (!layers_toggle.cables || !cables.length) return null

    const segments = []
    for (const cable of cables) {
      const color = hexToRgb(cable.color || '#00D4D4')
      for (const coordSet of cable.coords || []) {
        for (let i = 0; i < coordSet.length - 1; i++) {
          segments.push({
            from:  coordSet[i],
            to:    coordSet[i + 1],
            color: [...color, 160],
            name:  cable.name,
            id:    cable.id,
          })
        }
      }
    }
    if (!segments.length) return null

    return new LineLayer({
      id: 'undersea-cables',
      data: segments,
      getSourcePosition: d => d.from,
      getTargetPosition: d => d.to,
      getColor: d => d.color,
      getWidth: 1.5,
      widthMinPixels: 1,
      widthMaxPixels: 3,
      pickable: false,
    })
  }, [cables, layers_toggle.cables])

  const deckLayers = [
    oceanLayer,
    worldLayer,
    bordersLayer,
    cablesLayer,
    militaryBasesLayer,
    heatmapLayer,      // density heatmap — above static layers, below assets
    aircraftTrailLayer,
    vesselTrailLayer,
    regionLayer,
    footprintLayer,
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
        onClick={info => {
          if (info.object) return  // asset click handled by layer onClick
          clearFocus()
          // info.coordinate is [lon, lat] in GlobeView on empty-space clicks
          if (info.coordinate) handleRegionClick(info.coordinate)
        }}
        parameters={{ clearColor: [0.031, 0.047, 0.078, 1] }}
      />
      <CameraHUD viewState={viewState} />
    </div>
  )
}
