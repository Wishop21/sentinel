/**
 * SENTINEL — Global state store (Zustand)
 *
 * Single source of truth for:
 *  - Layer visibility toggles
 *  - Active filters (classification, provider)
 *  - Selected/focused asset
 *  - Live data from API
 */

import { create } from 'zustand'

const useStore = create((set, get) => ({

  // ── Layer toggles ─────────────────────────────────────────
  layers: {
    aircraft:   true,
    vessels:    true,
    satellites: true,
  },

  toggleLayer: (layer) => set(state => ({
    layers: { ...state.layers, [layer]: !state.layers[layer] }
  })),

  // ── Classification filter ─────────────────────────────────
  // null = show all
  classificationFilter: null,
  setClassificationFilter: (f) => set({ classificationFilter: f }),

  // ── Provider/group filters ────────────────────────────────
  satelliteGroupFilter: null,   // e.g. 'starlink', 'gps-ops', null = all
  setSatelliteGroupFilter: (g) => set({ satelliteGroupFilter: g }),

  // ── Focused asset (click-to-focus) ────────────────────────
  // { id, type, data, screenX, screenY }
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

  // ── Metrics (Tier 1) ──────────────────────────────────────
  metrics: null,
  setMetrics: (m) => set({ metrics: m }),

  // ── Data quality ──────────────────────────────────────────
  dataQuality: [],
  setDataQuality: (q) => set({ dataQuality: q }),

  // ── Computed helpers ──────────────────────────────────────
  getFilteredAircraft: () => {
    const { aircraft, classificationFilter } = get()
    if (!classificationFilter) return aircraft
    try {
      return aircraft.filter(a => (a.classification ?? 'unknown') === classificationFilter)
    } catch { return [] }
  },

  getFilteredVessels: () => {
    const { vessels, classificationFilter } = get()
    if (!classificationFilter) return vessels
    try {
      return vessels.filter(v => (v.classification ?? 'unknown') === classificationFilter)
    } catch { return [] }
  },

  getFilteredSatellites: () => {
    const { satellites, classificationFilter, satelliteGroupFilter } = get()
    let result = satellites
    try {
      if (classificationFilter) result = result.filter(s => (s.classification ?? 'unknown') === classificationFilter)
      if (satelliteGroupFilter) result = result.filter(s => s.group === satelliteGroupFilter)
    } catch { return [] }
    return result
  },
}))

export default useStore
