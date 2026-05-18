/**
 * SENTINEL — Global state store (Zustand)
 * frontend-app/src/store/index.js
 */

import { create } from 'zustand'

const TRAIL_LENGTH = 8

const useStore = create((set, get) => ({

  // ── Layer toggles ─────────────────────────────────────────
  layers: {
    aircraft:        true,
    vessels:         true,
    satellites:      true,
    borders:         true,
    cables:          false,
    mil_airfields:   false,
    mil_naval:       false,
    mil_bases:       false,
    mil_barracks:    false,
    mil_missiles:    false,
    mil_training:    false,
  },

  toggleLayer: (layer) => set(state => ({
    layers: { ...state.layers, [layer]: !state.layers[layer] }
  })),

  // ── Classification filter ─────────────────────────────────
  classificationFilter: null,
  setClassificationFilter: (f) => set({ classificationFilter: f }),

  // ── Provider/group filters ────────────────────────────────
  satelliteGroupFilter: null,
  setSatelliteGroupFilter: (g) => set({ satelliteGroupFilter: g }),

  // ── Focused asset ─────────────────────────────────────────
  focusedAsset: null,
  setFocusedAsset: (asset) => set({ focusedAsset: asset }),
  clearFocus: () => set({ focusedAsset: null }),

  // ── Live data ─────────────────────────────────────────────
  aircraft:   [],
  vessels:    [],
  satellites: [],

  // Full replacement — used on first load when the store is empty.
  setAircraft:   (data) => set({ aircraft: data }),
  setVessels:    (data) => set({ vessels: data }),
  setSatellites: (data) => set({ satellites: data }),

  // ── Aircraft delta merge ───────────────────────────────────
  // Called on every poll after the initial load. Diffs incoming records
  // against the current store by icao24 + last_contact. Only records
  // that have a new last_contact (i.e. actually moved or updated) are
  // replaced. Records present in the store but absent from the new
  // payload are removed (aircraft that landed or left coverage).
  //
  // Critically: if the merged result is identical in length and no
  // records changed, the existing array reference is returned unchanged.
  // This means deck.gl's useMemo dependency on `aircraft` does not fire,
  // and no GPU buffer upload occurs for that poll cycle.
  mergeAircraft: (incoming) => set(state => {
    const prev = state.aircraft

    // Index current state by icao24 for O(1) lookup
    const prevMap = new Map(prev.map(a => [a.icao24, a]))

    let changed = false

    // Check for removals — aircraft in store but not in new payload
    if (prev.length !== incoming.length) changed = true

    // Build merged array. For each incoming record, use the new version
    // only if last_contact has advanced; otherwise keep the existing object
    // reference so the array slot is stable.
    const merged = incoming.map(next => {
      const existing = prevMap.get(next.icao24)
      if (!existing) {
        changed = true
        return next
      }
      // last_contact is a Unix timestamp from OpenSky — unchanged means
      // the state vector is stale and the aircraft hasn't moved
      if (existing.last_contact !== next.last_contact) {
        changed = true
        return next
      }
      return existing  // same reference — no change
    })

    // If nothing changed, return the existing state reference unchanged.
    // Zustand will see the same aircraft reference and skip a re-render.
    if (!changed) return state

    return { aircraft: merged }
  }),

  // ── Undersea cables (fetched once on first toggle) ────────
  cables: [],
  setCables: (data) => set({ cables: data }),
  cablesLoaded: false,
  setCablesLoaded: (v) => set({ cablesLoaded: v }),

  // ── Military bases (static, loaded once) ──────────────────
  militaryBases: [],
  setMilitaryBases: (data) => set({ militaryBases: data }),
  militaryBasesLoaded: false,
  setMilitaryBasesLoaded: (v) => set({ militaryBasesLoaded: v }),

  // ── Position history (for trails) ─────────────────────────
  // satellites key included to prevent crashes if satellite trail
  // rendering is added later, and to keep the shape consistent.
  positionHistory: {
    aircraft:   new Map(),
    vessels:    new Map(),
    satellites: new Map(),
  },

  updatePositionHistory: (domain, newData) => set(state => {
    const history = new Map(state.positionHistory[domain])
    if (!history) return state  // guard against unknown domain

    const now = Date.now()

    for (const asset of newData) {
      const id  = asset.icao24 || asset.mmsi || asset.name
      const lon = asset.lon
      const lat = asset.lat
      if (!id || lon == null || lat == null) continue

      const alt = asset.baro_altitude ?? asset.altitude_km ?? 0
      const prev = history.get(id) || []
      const updated = [...prev, { lon, lat, alt, t: now }]
      if (updated.length > TRAIL_LENGTH) updated.splice(0, updated.length - TRAIL_LENGTH)
      history.set(id, updated)
    }

    const cutoff = now - 120000
    for (const [id, positions] of history) {
      if (positions[positions.length - 1]?.t < cutoff) history.delete(id)
    }

    return {
      positionHistory: {
        ...state.positionHistory,
        [domain]: history,
      }
    }
  }),

  // ── Data source status ────────────────────────────────────
  // Tracks per-domain fetch health so the UI can show staleness.
  // lastUpdated: Date.now() timestamp of last successful fetch, or null
  // ok: true if last fetch succeeded, false if it failed
  dataSourceStatus: {
    aircraft:   { ok: false, lastUpdated: null },
    vessels:    { ok: false, lastUpdated: null },
    satellites: { ok: false, lastUpdated: null },
    metrics:    { ok: false, lastUpdated: null },
  },

  setDataSourceStatus: (domain, status) => set(state => ({
    dataSourceStatus: {
      ...state.dataSourceStatus,
      [domain]: {
        // Preserve lastUpdated from previous state on failure
        // so the UI can show "last seen X minutes ago" rather than null
        lastUpdated: status.lastUpdated ?? state.dataSourceStatus[domain]?.lastUpdated,
        ok: status.ok,
      },
    }
  })),

  // ── Metrics ───────────────────────────────────────────────
  metrics: null,
  setMetrics: (m) => set({ metrics: m }),

  dataQuality: [],
  setDataQuality: (q) => set({ dataQuality: q }),

  // ── Selected region (H3 click-to-select) ──────────────────
  // null when no region is selected.
  // When set: { h3Index, boundary, center, stats, loading }
  //   h3Index  : string — H3 cell identifier
  //   boundary : [[lon, lat], ...] — closed ring for deck.gl rendering
  //   center   : { lat, lon } — cell centre
  //   stats    : full API response from /api/analytics/region, or null while loading
  //   loading  : bool — true while the request is in flight
  selectedRegion: null,
  setSelectedRegion: (region) => set({ selectedRegion: region }),
  clearRegion: () => set({ selectedRegion: null }),

  // ── Heatmap domain ────────────────────────────────────────
  // Which domain to show as an H3 density heatmap.
  // null = heatmap off. One of: 'aircraft' | 'vessels' | 'satellites'
  // Only one domain shown at a time — overlaying all three would be
  // visually unreadable and analytically meaningless.
  heatmapDomain: null,
  setHeatmapDomain: (domain) => set({ heatmapDomain: domain }),

  // ── Anomaly alerts ────────────────────────────────────────
  // Flat array of alert objects produced by scanAnomalies().
  // Recomputed after each aircraft/vessel/satellite data update.
  // Capped at 50 entries in the scanner to prevent UI flooding.
  alerts: [],
  setAlerts: (alerts) => set({ alerts }),
}))

export default useStore
