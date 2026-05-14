/**
 * SENTINEL — Global state store (Zustand)
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

  setAircraft:   (data) => set({ aircraft: data }),
  setVessels:    (data) => set({ vessels: data }),
  setSatellites: (data) => set({ satellites: data }),

  // ── Undersea cables (fetched once on first toggle) ────────────────────────
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
  positionHistory: {
    aircraft: new Map(),
    vessels:  new Map(),
  },

  updatePositionHistory: (domain, newData) => set(state => {
    const history = new Map(state.positionHistory[domain])
    const now = Date.now()

    for (const asset of newData) {
      const id  = asset.icao24 || asset.mmsi
      const lon = asset.lon
      const lat = asset.lat
      if (!id || lon == null || lat == null) continue

      const alt = asset.baro_altitude ?? 0
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

  // ── Metrics ───────────────────────────────────────────────
  metrics: null,
  setMetrics: (m) => set({ metrics: m }),

  dataQuality: [],
  setDataQuality: (q) => set({ dataQuality: q }),
}))

export default useStore
