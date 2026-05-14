/**
 * SENTINEL — Icon Atlas
 *
 * Generates SVG icons as data URLs for use with deck.gl IconLayer.
 * All icons are 64x64px, designed for dark globe backgrounds.
 *
 * Icon types:
 *   plane          — filled arrowhead, civilian/commercial aircraft
 *   plane_military — angular delta shape, military aircraft
 *   ship           — teardrop chevron, vessels
 *   satellite      — four-pointed cross, satellites
 * frontend-app/src/layers/icons.js
 */

// ── SVG definitions ──────────────────────────────────────────

// Plane icon — sleek arrowhead pointing UP (0° = north, rotated by true_track)
const PLANE_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <g transform="translate(32,32)">
    <!-- Main body -->
    <polygon points="0,-22 6,-2 0,4 -6,-2" fill="white" opacity="0.95"/>
    <!-- Wings -->
    <polygon points="-18,4 -3,0 -3,8 -18,10" fill="white" opacity="0.85"/>
    <polygon points="18,4 3,0 3,8 18,10" fill="white" opacity="0.85"/>
    <!-- Tail -->
    <polygon points="-8,12 0,6 8,12 0,16" fill="white" opacity="0.75"/>
  </g>
</svg>`

// Military plane — sharper delta wing shape
const PLANE_MILITARY_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <g transform="translate(32,32)">
    <!-- Delta wing body -->
    <polygon points="0,-22 14,12 0,6 -14,12" fill="white" opacity="0.95"/>
    <!-- Tail fins -->
    <polygon points="-6,8 -14,18 -2,14" fill="white" opacity="0.8"/>
    <polygon points="6,8 14,18 2,14" fill="white" opacity="0.8"/>
  </g>
</svg>`

// Ship icon — elongated teardrop pointing UP
const SHIP_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <g transform="translate(32,32)">
    <!-- Hull -->
    <ellipse cx="0" cy="2" rx="7" ry="16" fill="white" opacity="0.9"/>
    <!-- Bow (pointed front) -->
    <polygon points="0,-20 6,-8 -6,-8" fill="white" opacity="0.95"/>
    <!-- Bridge superstructure -->
    <rect x="-4" y="-4" width="8" height="8" rx="1" fill="white" opacity="0.7"/>
  </g>
</svg>`

// Satellite icon — cross with solar panels
const SATELLITE_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <g transform="translate(32,32)">
    <!-- Body -->
    <rect x="-5" y="-5" width="10" height="10" rx="1" fill="white" opacity="0.95"/>
    <!-- Solar panels horizontal -->
    <rect x="-20" y="-3" width="12" height="6" rx="1" fill="white" opacity="0.7"/>
    <rect x="8" y="-3" width="12" height="6" rx="1" fill="white" opacity="0.7"/>
    <!-- Panel connectors -->
    <rect x="-8" y="-1" width="4" height="2" fill="white" opacity="0.5"/>
    <rect x="4" y="-1" width="4" height="2" fill="white" opacity="0.5"/>
    <!-- Antenna -->
    <line x1="0" y1="-5" x2="0" y2="-12" stroke="white" stroke-width="1.5" opacity="0.6"/>
    <circle cx="0" cy="-13" r="2" fill="white" opacity="0.6"/>
  </g>
</svg>`

// ── Convert SVG to data URL ───────────────────────────────────
function svgToDataURL(svg) {
  const encoded = encodeURIComponent(svg.trim())
  return `data:image/svg+xml,${encoded}`
}

// ── Icon atlas entries ────────────────────────────────────────
// deck.gl IconLayer expects: { url, width, height, anchorX, anchorY }
// anchorX/Y = pixel offset of the icon centre from top-left

export const ICON_ATLAS = {
  plane: {
    url:     svgToDataURL(PLANE_SVG),
    width:   64,
    height:  64,
    anchorX: 32,
    anchorY: 32,
  },
  plane_military: {
    url:     svgToDataURL(PLANE_MILITARY_SVG),
    width:   64,
    height:  64,
    anchorX: 32,
    anchorY: 32,
  },
  ship: {
    url:     svgToDataURL(SHIP_SVG),
    width:   64,
    height:  64,
    anchorX: 32,
    anchorY: 32,
  },
  satellite: {
    url:     svgToDataURL(SATELLITE_SVG),
    width:   64,
    height:  64,
    anchorX: 32,
    anchorY: 32,
  },
}

// ── Icon mapping helpers ──────────────────────────────────────

export function getAircraftIcon(d) {
  return d.classification === 'military' ? 'plane_military' : 'plane'
}

export function getAircraftColor(d) {
  // Altitude-based colour: blue-grey (ground) → amber (cruise)
  const alt = d.baro_altitude ?? 0
  const t = Math.min(Math.max(alt / 13000, 0), 1)
  const r = Math.round(80  + t * (245 - 80))
  const g = Math.round(100 + t * (166 - 100))
  const b = Math.round(120 + t * (35  - 120))

  // Military override — red tint at cruise, orange at low
  if (d.classification === 'military') {
    return [255, Math.round(60 + t * 40), Math.round(60 - t * 40)]
  }

  return [r, g, b]
}

export function getVesselColor(d) {
  const cls = d.classification
  if (cls === 'military')   return [255, 80, 80]
  if (cls === 'commercial') return [0, 212, 212]
  if (cls === 'civilian')   return [96, 165, 250]
  if (cls === 'cargo')      return [251, 146, 60]
  return [0, 212, 212]
}
