/**
 * SENTINEL — Anomaly detection and proximity alerting
 * frontend-app/src/analytics/anomalies.js
 *
 * Pure functions — no React, no store, no side effects.
 * All rules are domain-knowledge based and explicitly documented.
 * Results are labelled as potential anomalies, not confirmed incidents.
 *
 * Alert object shape:
 *   {
 *     id:         string   — unique stable key for React rendering
 *     type:       string   — 'anomaly' | 'proximity'
 *     severity:   string   — 'high' | 'medium' | 'low'
 *     domain:     string   — 'aircraft' | 'vessel' | 'satellite'
 *     rule:       string   — machine-readable rule name
 *     label:      string   — human-readable short description
 *     detail:     string   — fuller explanation shown in panel
 *     asset:      object   — the raw asset record
 *     lat:        number   — position for globe highlight
 *     lon:        number   — position for globe highlight
 *     confidence: string   — 'high' | 'medium' | 'low'
 *   }
 */

// ── Constants ────────────────────────────────────────────────

// Aircraft thresholds
const MAX_CIVIL_ALTITUDE_M   = 18000    // ~FL590 — above this is unusual for civil traffic
const MAX_CIVIL_SPEED_MS     = 340      // ~660 kts — above supersonic threshold for civil
const HIGH_SPEED_THRESHOLD_MS = 300     // ~583 kts — fast but not supersonic, medium flag

// Vessel thresholds
const MAX_PLAUSIBLE_SPEED_KTS = 50      // physically impossible for almost all vessel types
const AIS_HEADING_UNAVAILABLE = 511     // ITU sentinel value — vessel suppressing heading

// Satellite thresholds
const MAX_TLE_AGE_DAYS = 7             // TLE older than this may have significant position error

// Proximity alerting
const DEFAULT_PROXIMITY_KM = 200       // military aircraft within this radius of any vessel

// ── Haversine distance (km) ───────────────────────────────────
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

// ── TLE age helper ────────────────────────────────────────────
function tleDaysOld(tle1) {
  // TLE line 1 encodes epoch as YYddd.dddddddd in columns 19-32
  // e.g. "24045.12345678" = day 45 of 2024
  try {
    const epoch = tle1.slice(18, 32).trim()
    const year2 = parseInt(epoch.slice(0, 2), 10)
    const year  = year2 >= 57 ? 1900 + year2 : 2000 + year2
    const doy   = parseFloat(epoch.slice(2))
    const epochDate = new Date(year, 0, 1)
    epochDate.setDate(epochDate.getDate() + doy - 1)
    return (Date.now() - epochDate.getTime()) / 86400000
  } catch {
    return null
  }
}

// ── Aircraft anomaly rules ────────────────────────────────────
function scanAircraft(aircraft) {
  const alerts = []

  for (const a of aircraft) {
    if (!a.icao24 || a.lat == null || a.lon == null) continue

    const id       = a.icao24
    const callsign = (a.callsign || '').trim()
    const alt      = a.baro_altitude ?? 0
    const speed    = a.velocity ?? 0
    const isMil    = a.classification === 'military'
    const onGround = a.on_ground

    if (onGround) continue  // ground state data is often noisy — skip

    // Rule A1: extreme altitude for non-military aircraft
    if (alt > MAX_CIVIL_ALTITUDE_M && !isMil) {
      alerts.push({
        id:         `A1-${id}`,
        type:       'anomaly',
        severity:   'medium',
        domain:     'aircraft',
        rule:       'extreme_altitude',
        label:      `High altitude: ${(alt / 1000).toFixed(1)} km`,
        detail:     `${callsign || id} at FL${Math.round(alt / 30.48)} — above normal civil ceiling. Possible misreport, test flight, or reconnaissance.`,
        asset:      a,
        lat:        a.lat,
        lon:        a.lon,
        confidence: 'low',  // ADS-B altitude data has known inaccuracies
      })
    }

    // Rule A2: supersonic speed for any aircraft
    if (speed > MAX_CIVIL_SPEED_MS) {
      alerts.push({
        id:         `A2-${id}`,
        type:       'anomaly',
        severity:   'high',
        domain:     'aircraft',
        rule:       'supersonic_speed',
        label:      `Speed anomaly: ${Math.round(speed * 1.944)} kts`,
        detail:     `${callsign || id} reporting ${Math.round(speed * 1.944)} kts — above supersonic threshold. Likely ADS-B data error or military fast jet.`,
        asset:      a,
        lat:        a.lat,
        lon:        a.lon,
        confidence: 'low',  // OpenSky speed data is frequently noisy
      })
    }

    // Rule A3: fast but subsonic — flag at medium severity only for non-military
    if (speed > HIGH_SPEED_THRESHOLD_MS && speed <= MAX_CIVIL_SPEED_MS && !isMil) {
      alerts.push({
        id:         `A3-${id}`,
        type:       'anomaly',
        severity:   'low',
        domain:     'aircraft',
        rule:       'high_speed',
        label:      `High speed: ${Math.round(speed * 1.944)} kts`,
        detail:     `${callsign || id} at ${Math.round(speed * 1.944)} kts — above typical commercial cruise speed.`,
        asset:      a,
        lat:        a.lat,
        lon:        a.lon,
        confidence: 'low',
      })
    }

    // Rule A4: military aircraft suppressing callsign
    if (isMil && !callsign) {
      alerts.push({
        id:         `A4-${id}`,
        type:       'anomaly',
        severity:   'medium',
        domain:     'aircraft',
        rule:       'military_no_callsign',
        label:      `Military: no callsign`,
        detail:     `ICAO ${id} classified military but broadcasting no callsign. Position visible; identity suppressed.`,
        asset:      a,
        lat:        a.lat,
        lon:        a.lon,
        confidence: 'medium',
      })
    }
  }

  return alerts
}

// ── Vessel anomaly rules ──────────────────────────────────────
function scanVessels(vessels) {
  const alerts = []

  for (const v of vessels) {
    if (!v.mmsi || v.lat == null || v.lon == null) continue

    const id    = v.mmsi
    const name  = v.name || id
    const speed = v.speed ?? 0
    const hdg   = v.heading

    // Rule V1: physically implausible speed
    if (speed > MAX_PLAUSIBLE_SPEED_KTS) {
      alerts.push({
        id:         `V1-${id}`,
        type:       'anomaly',
        severity:   'high',
        domain:     'vessel',
        rule:       'impossible_speed',
        label:      `Impossible speed: ${speed.toFixed(1)} kts`,
        detail:     `${name} reporting ${speed.toFixed(1)} kts — physically impossible for surface vessels. Likely AIS spoofing or data corruption.`,
        asset:      v,
        lat:        v.lat,
        lon:        v.lon,
        confidence: 'high',  // 50 kts is unambiguous for surface vessels
      })
    }

    // Rule V2: heading suppressed (AIS sentinel value 511)
    if (hdg === AIS_HEADING_UNAVAILABLE) {
      alerts.push({
        id:         `V2-${id}`,
        type:       'anomaly',
        severity:   'low',
        domain:     'vessel',
        rule:       'heading_suppressed',
        label:      `Heading suppressed`,
        detail:     `${name} (MMSI ${id}) reporting heading 511 — AIS sentinel for "not available". Vessel is hiding heading data.`,
        asset:      v,
        lat:        v.lat,
        lon:        v.lon,
        confidence: 'medium',
      })
    }
  }

  return alerts
}

// ── Satellite anomaly rules ───────────────────────────────────
function scanSatellites(satellites) {
  const alerts = []

  for (const s of satellites) {
    if (!s.name || s.lat == null || s.lon == null) continue
    if (!s.tle1) continue

    // Rule S1: stale TLE — propagated position may be significantly wrong
    const ageDays = tleDaysOld(s.tle1)
    if (ageDays !== null && ageDays > MAX_TLE_AGE_DAYS) {
      alerts.push({
        id:         `S1-${s.name}`,
        type:       'anomaly',
        severity:   'low',
        domain:     'satellite',
        rule:       'stale_tle',
        label:      `Stale TLE: ${Math.round(ageDays)}d old`,
        detail:     `${s.name} position computed from TLE ${Math.round(ageDays)} days old. Position error may exceed hundreds of km.`,
        asset:      s,
        lat:        s.lat,
        lon:        s.lon,
        confidence: 'high',
      })
    }
  }

  return alerts
}

// ── Proximity alerting ────────────────────────────────────────
function checkProximity(aircraft, vessels, radiusKm = DEFAULT_PROXIMITY_KM) {
  const alerts = []

  // Only check military aircraft — reduces O(n×m) to manageable size
  const milAircraft = aircraft.filter(
    a => a.classification === 'military' && a.lat != null && a.lon != null && !a.on_ground
  )

  if (!milAircraft.length || !vessels.length) return alerts

  for (const a of milAircraft) {
    for (const v of vessels) {
      if (v.lat == null || v.lon == null) continue

      const distKm = haversineKm(a.lat, a.lon, v.lat, v.lon)
      if (distKm <= radiusKm) {
        const callsign = (a.callsign || a.icao24 || '').trim()
        const vesselName = v.name || v.mmsi

        alerts.push({
          id:         `P1-${a.icao24}-${v.mmsi}`,
          type:       'proximity',
          severity:   distKm < 50 ? 'high' : 'medium',
          domain:     'aircraft',
          rule:       'military_vessel_proximity',
          label:      `Military near vessel: ${Math.round(distKm)} km`,
          detail:     `${callsign} within ${Math.round(distKm)} km of ${vesselName}. Classification confidence: ${a.confidence || 'unknown'}.`,
          asset:      a,
          lat:        a.lat,
          lon:        a.lon,
          confidence: a.confidence || 'low',
        })
      }
    }
  }

  return alerts
}

// ── Main export ───────────────────────────────────────────────
/**
 * Run all anomaly and proximity checks against current live data.
 * Returns a flat, deduplicated array of alert objects sorted by severity.
 *
 * @param {Array} aircraft
 * @param {Array} vessels
 * @param {Array} satellites
 * @returns {Array} alerts
 */
export function scanAnomalies(aircraft, vessels, satellites) {
  const all = [
    ...scanAircraft(aircraft),
    ...scanVessels(vessels),
    ...scanSatellites(satellites),
    ...checkProximity(aircraft, vessels),
  ]

  // Sort: high → medium → low severity
  const order = { high: 0, medium: 1, low: 2 }
  all.sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3))

  // Cap total alerts to prevent panel flooding on noisy data days
  return all.slice(0, 50)
}

export { DEFAULT_PROXIMITY_KM, MAX_TLE_AGE_DAYS }
