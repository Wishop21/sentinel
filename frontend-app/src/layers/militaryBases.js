/**
 * SENTINEL — Military bases data layer
 *
 * Fetches from our FastAPI backend which proxies Overpass API.
 * Cached in-memory for the browser session after first load.
 *
 * Military type → colour mapping and display helpers.
 */

// In-memory cache for this browser session
let _cache = null
let _fetchPromise = null

// Military type → colour [r, g, b]
export const MILITARY_TYPE_COLOR = {
  airfield:    [255, 140,  0],   // orange
  naval_base:  [  0, 160, 220],  // blue
  harbour:     [  0, 160, 220],  // blue
  base:        [255,  68,  68],  // red
  barracks:    [200,  80,  80],  // dark red
  bunker:      [160,  60,  60],  // darker red
  missile_site:[255,  30,  30],  // bright red
  launchpad:   [255, 100,  30],  // orange-red
  checkpoint:  [200, 150,  50],  // yellow-orange
  range:       [180, 100,  50],  // brown-orange
  training_area:[150, 100, 60],  // tan
  default:     [220,  80,  80],  // fallback red
}

export const MILITARY_TYPE_LABELS = {
  airfield:              'Airfield',
  naval_base:            'Naval Base',
  harbour:               'Naval Harbour',
  base:                  'Military Base',
  barracks:              'Barracks',
  bunker:                'Bunker',
  checkpoint:            'Checkpoint',
  danger_area:           'Danger Area',
  range:                 'Firing Range',
  training_area:         'Training Area',
  nuclear_explosion_site:'Nuclear Test Site',
  missile_site:          'Missile Site',
  ammunition:            'Ammunition Depot',
  launchpad:             'Launch Facility',
  office:                'Military Office',
}

export function getMilitaryBaseColor(feature) {
  return MILITARY_TYPE_COLOR[feature.type] || MILITARY_TYPE_COLOR.default
}

export function getMilitaryTypeLabel(type) {
  return MILITARY_TYPE_LABELS[type] || (type ? type.replace(/_/g, ' ') : 'Military Facility')
}

/**
 * Fetch military bases via the SENTINEL backend.
 * Cached after first successful fetch for the session lifetime.
 */
export async function fetchMilitaryBases() {
  if (_cache !== null) return _cache

  if (_fetchPromise) return _fetchPromise

  _fetchPromise = (async () => {
    try {
      const resp = await fetch('/api/layers/military-bases')
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const json = await resp.json()
      _cache = json.data || []
      console.info(`[SENTINEL] Military bases loaded: ${_cache.length} facilities from OSM`)
      return _cache
    } catch (err) {
      console.warn('[SENTINEL] Military bases fetch failed:', err.message)
      _cache = []
      _fetchPromise = null  // Allow retry on next toggle
      return []
    }
  })()

  return _fetchPromise
}
