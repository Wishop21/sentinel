/**
 * SENTINEL — Asset info card
 * Floating card anchored near the clicked asset.
 * Smart positioning: flips side if near screen edge.
 */

import useStore from '../store'

const DOMAIN_COLOR = {
  aircraft:  'var(--aircraft)',
  vessel:    'var(--vessel)',
  satellite: 'var(--satellite)',
}

const CONFIDENCE_COLOR = {
  high:    'var(--commercial)',
  medium:  'var(--aircraft)',
  low:     'var(--cargo)',
  unknown: 'var(--text-dim)',
}

function Field({ label, value, mono }) {
  if (value == null || value === '' || value === 'None') return null
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: 2 }}>
        {label}
      </div>
      <div style={{
        fontSize: 13,
        fontFamily: mono ? 'var(--font-mono)' : 'var(--font-display)',
        color: 'var(--text-primary)',
        fontWeight: mono ? 400 : 500,
        wordBreak: 'break-all',
      }}>
        {value}
      </div>
    </div>
  )
}

function formatAlt(metres) {
  if (metres == null) return null
  return `${(metres / 1000).toFixed(1)} km / ${Math.round(metres * 3.28084).toLocaleString()} ft`
}

function formatSpeed(ms) {
  if (ms == null) return null
  return `${Math.round(ms * 1.944)} kts`
}

function formatSpeedKnots(knots) {
  if (knots == null) return null
  return `${knots.toFixed(1)} kts`
}

export default function AssetInfoCard() {
  const focusedAsset = useStore(s => s.focusedAsset)
  const clearFocus   = useStore(s => s.clearFocus)

  if (!focusedAsset) return null

  const { type, data, screenX, screenY } = focusedAsset
  const color = DOMAIN_COLOR[type] || 'var(--text-primary)'

  // Smart positioning — keep card on screen
  const CARD_WIDTH  = 240
  const CARD_HEIGHT = 320
  const MARGIN      = 16
  const OFFSET      = 20

  const vw = window.innerWidth
  const vh = window.innerHeight

  let left = screenX + OFFSET
  let top  = screenY - CARD_HEIGHT / 2

  // Flip horizontally if too close to right edge
  if (left + CARD_WIDTH + MARGIN > vw) {
    left = screenX - CARD_WIDTH - OFFSET
  }

  // Clamp vertically
  top = Math.max(MARGIN + 48, Math.min(top, vh - CARD_HEIGHT - MARGIN))

  return (
    <div
      className="anim-fade"
      style={{
        position: 'fixed',
        left, top,
        width: CARD_WIDTH,
        zIndex: 200,
        background: 'var(--bg-card)',
        border: `1px solid ${color}40`,
        borderRadius: 'var(--radius-lg)',
        backdropFilter: 'blur(20px)',
        boxShadow: `0 0 40px ${color}20, 0 8px 32px rgba(0,0,0,0.6)`,
        overflow: 'hidden',
      }}
    >
      {/* Header bar */}
      <div style={{
        padding: '10px 14px',
        borderBottom: `1px solid ${color}30`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: `${color}0A`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: color,
            boxShadow: `0 0 8px ${color}`,
          }} />
          <span style={{
            fontSize: 10, fontFamily: 'var(--font-mono)',
            color, letterSpacing: '0.12em', fontWeight: 500,
          }}>
            {type.toUpperCase()}
          </span>
          {data.confidence && data.confidence !== 'unknown' && (
            <span style={{
              fontSize: 8,
              fontFamily: 'var(--font-mono)',
              color: CONFIDENCE_COLOR[data.confidence] || 'var(--text-dim)',
              background: `${CONFIDENCE_COLOR[data.confidence]}15`,
              border: `1px solid ${CONFIDENCE_COLOR[data.confidence]}40`,
              padding: '1px 5px',
              borderRadius: 3,
              letterSpacing: '0.08em',
            }}>
              {data.confidence} conf.
            </span>
          )}
        </div>
        <button
          onClick={clearFocus}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-dim)', fontSize: 14, lineHeight: 1,
            padding: '2px 4px',
            borderRadius: 3,
            transition: 'color 0.1s',
          }}
          onMouseEnter={e => e.target.style.color = 'var(--text-primary)'}
          onMouseLeave={e => e.target.style.color = 'var(--text-dim)'}
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: '12px 14px' }}>

        {/* Classification badge */}
        {data.classification && (
          <div style={{ marginBottom: 12 }}>
            <span style={{
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              fontWeight: 500,
              color: getClassColor(data.classification),
              background: `${getClassColor(data.classification)}15`,
              border: `1px solid ${getClassColor(data.classification)}40`,
              padding: '3px 8px',
              borderRadius: 4,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}>
              {data.classification}
            </span>
          </div>
        )}

        {/* Aircraft fields */}
        {type === 'aircraft' && (
          <>
            <Field label="CALLSIGN"       value={data.callsign || data.icao24} mono />
            <Field label="ICAO HEX"       value={data.icao24} mono />
            <Field label="ORIGIN"         value={data.origin_country} />
            <Field label="ALTITUDE"       value={formatAlt(data.baro_altitude)} mono />
            <Field label="SPEED"          value={formatSpeed(data.velocity)} mono />
            <Field label="HEADING"        value={data.true_track != null ? `${Math.round(data.true_track)}°` : null} mono />
            <Field label="STATUS"         value={data.on_ground ? 'On ground' : 'Airborne'} />
          </>
        )}

        {/* Vessel fields */}
        {type === 'vessel' && (
          <>
            <Field label="NAME"       value={data.name} />
            <Field label="MMSI"       value={data.mmsi} mono />
            <Field label="FLAG"       value={data.flag} />
            <Field label="SPEED"      value={formatSpeedKnots(data.speed)} mono />
            <Field label="HEADING"    value={data.heading != null ? `${Math.round(data.heading)}°` : null} mono />
          </>
        )}

        {/* Satellite fields */}
        {type === 'satellite' && (
          <>
            <Field label="NAME"       value={data.name} />
            <Field label="GROUP"      value={data.group} />
            <Field label="ALTITUDE"   value={data.altitude_km != null ? `${data.altitude_km.toFixed(0)} km` : null} mono />
            <Field label="LAT / LON"  value={
              data.lat != null
                ? `${data.lat.toFixed(2)}° / ${data.lon.toFixed(2)}°`
                : null
            } mono />
          </>
        )}

        {/* Coordinates footer */}
        {data.lat != null && (
          <div style={{
            marginTop: 8,
            paddingTop: 8,
            borderTop: '1px solid var(--border-dim)',
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-dim)',
          }}>
            {data.lat.toFixed(4)}°, {data.lon.toFixed(4)}°
          </div>
        )}
      </div>
    </div>
  )
}

function getClassColor(cls) {
  const map = {
    military:   'var(--military)',
    commercial: 'var(--commercial)',
    civilian:   'var(--civilian)',
    cargo:      'var(--cargo)',
    crewed:     'var(--aircraft)',
    navigation: 'var(--civilian)',
    civil:      'var(--civilian)',
    debris:     'var(--text-secondary)',
    unknown:    'var(--text-dim)',
  }
  return map[cls] || 'var(--text-dim)'
}
