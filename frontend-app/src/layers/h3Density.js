/**
 * SENTINEL — H3 density computation
 * frontend-app/src/layers/h3Density.js
 *
 * Pure functions — no side effects, no React, no store.
 * Takes a live asset array and returns H3 cell density data
 * ready for deck.gl SolidPolygonLayer rendering.
 *
 * Colour scale is relative to the current max cell count so the
 * heatmap adapts correctly whether there are 50 or 12,000 assets.
 */

import { latLngToCell, cellToBoundary } from 'h3-js'

const RESOLUTION = 3  // ~12,100 km² per cell — matches region query resolution

/**
 * Compute per-cell asset counts for a given asset array.
 *
 * @param {Array}  assets   - live asset array from store
 * @param {string} latKey   - key for latitude field (default 'lat')
 * @param {string} lonKey   - key for longitude field (default 'lon')
 * @returns {Array} Array of { h3Index, count, polygon } objects
 */
export function computeH3Density(assets, latKey = 'lat', lonKey = 'lon') {
  if (!assets || assets.length === 0) return []

  // Count assets per H3 cell — O(n) with O(1) per asset
  const cellCounts = new Map()

  for (const asset of assets) {
    const lat = asset[latKey]
    const lon = asset[lonKey]
    if (lat == null || lon == null || !isFinite(lat) || !isFinite(lon)) continue

    try {
      const cell = latLngToCell(lat, lon, RESOLUTION)
      cellCounts.set(cell, (cellCounts.get(cell) || 0) + 1)
    } catch {
      // Invalid coordinates — skip silently
    }
  }

  if (cellCounts.size === 0) return []

  // Build result array with precomputed boundaries for deck.gl
  // cellToBoundary returns [[lat, lon], ...] — flip to [lon, lat] for deck.gl
  const result = []
  for (const [h3Index, count] of cellCounts) {
    try {
      const boundary = cellToBoundary(h3Index)
      const polygon = boundary.map(([lat, lon]) => [lon, lat])
      // Close the ring
      polygon.push(polygon[0])
      result.push({ h3Index, count, polygon })
    } catch {
      // Bad cell — skip
    }
  }

  return result
}

/**
 * Map a normalised value (0–1) to an RGBA colour.
 * Scale: dim teal → amber → orange → bright red.
 * Low-count cells stay subtle; high-density cells are unmistakable.
 *
 * @param {number} t - normalised density (0 = min, 1 = max)
 * @returns {[number, number, number, number]} RGBA
 */
export function densityColor(t) {
  // Four-stop gradient
  const stops = [
    { t: 0.00, r: 0,   g: 160, b: 150, a: 35  },  // dim teal
    { t: 0.25, t2: 0.25, r: 0, g: 210, b: 180, a: 70  },  // teal
    { t: 0.55, r: 245, g: 166, b: 35,  a: 120 },  // amber
    { t: 0.80, r: 255, g: 100, b: 30,  a: 160 },  // orange
    { t: 1.00, r: 255, g: 40,  b: 40,  a: 200 },  // red
  ]

  // Clamp
  const clamped = Math.max(0, Math.min(1, t))

  // Find surrounding stops
  let lo = stops[0]
  let hi = stops[stops.length - 1]
  for (let i = 0; i < stops.length - 1; i++) {
    if (clamped >= stops[i].t && clamped <= stops[i + 1].t) {
      lo = stops[i]
      hi = stops[i + 1]
      break
    }
  }

  // Linear interpolation between stops
  const range = hi.t - lo.t
  const frac  = range > 0 ? (clamped - lo.t) / range : 0

  return [
    Math.round(lo.r + frac * (hi.r - lo.r)),
    Math.round(lo.g + frac * (hi.g - lo.g)),
    Math.round(lo.b + frac * (hi.b - lo.b)),
    Math.round(lo.a + frac * (hi.a - lo.a)),
  ]
}

/**
 * Convert a raw density array to coloured deck.gl-ready objects.
 * Normalises counts against the current max so scale is always relative.
 *
 * @param {Array} densityData - output of computeH3Density()
 * @returns {Array} Same objects with `color` field added
 */
export function applyDensityColors(densityData) {
  if (!densityData.length) return []

  const maxCount = Math.max(...densityData.map(d => d.count))
  if (maxCount === 0) return []

  return densityData.map(d => ({
    ...d,
    // Use square root normalisation — compresses extreme outliers
    // so moderate-density cells aren't washed out by a few hotspots
    color: densityColor(Math.sqrt(d.count / maxCount)),
  }))
}
