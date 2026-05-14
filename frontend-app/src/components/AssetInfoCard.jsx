/**
 * SENTINEL — Asset info card
 * Floating card anchored near the clicked asset.
 * Draggable — click and drag the header to reposition.
 * Smart initial positioning: flips side if near screen edge.
 * frontend-app/src/components/AssetInfoCard.jsx
 */

import { useRef, useState, useEffect } from 'react'
import useStore from '../store'

const DOMAIN_COLOR = {
  aircraft:      'var(--aircraft)',
  vessel:        'var(--vessel)',
  satellite:     'var(--satellite)',
  military_base: 'var(--military)',
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

export default function AssetInfoCard() {
  const focusedAsset = useStore(s => s.focusedAsset)
  const clearFocus   = useStore(s => s.clearFocus)

  // Drag state
  const [position, setPosition] = useState(null)  // {x, y} — null = use smart default
  const dragging = useRef(false)
  const dragOffset = useRef({ x: 0, y: 0 })

  // Reset position when focused asset changes
  useEffect(() => {
    setPosition(null)
  }, [focusedAsset?.id])

  if (!focusedAsset) return null

  const { type, data, screenX, screenY } = focusedAsset
  const color = DOMAIN_COLOR[type] || 'var(--text-primary)'

  // Smart initial positioning
  const CARD_WIDTH  = 240
  const CARD_HEIGHT = 340
  const MARGIN      = 16
  const OFFSET      = 20
  const vw = window.innerWidth
  const vh = window.innerHeight

  let defaultLeft = screenX + OFFSET
  let defaultTop  = screenY - CARD_HEIGHT / 2
  if (defaultLeft + CARD_WIDTH + MARGIN > vw) defaultLeft = screenX - CARD_WIDTH - OFFSET
  defaultTop = Math.max(MARGIN + 48, Math.min(defaultTop, vh - CARD_HEIGHT - MARGIN))

  const left = position?.x ?? defaultLeft
  const top  = position?.y ?? defaultTop

  // Drag handlers
  const onMouseDown = (e) => {
    e.preventDefault()
    dragging.current = true
    dragOffset.current = {
      x: e.clientX - left,
      y: e.clientY - top,
    }

    const onMouseMove = (e) => {
      if (!dragging.current) return
      setPosition({
        x: Math.max(0, Math.min(e.clientX - dragOffset.current.x, vw - CARD_WIDTH)),
        y: Math.max(48, Math.min(e.clientY - dragOffset.current.y, vh - CARD_HEIGHT)),
      })
    }

    const onMouseUp = () => {
      dragging.current = false
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

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
        userSelect: 'none',
      }}
    >
      {/* Header — drag handle */}
      <div
        onMouseDown={onMouseDown}
        style={{
          padding: '10px 14px',
          borderBottom: `1px solid ${color}30`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: `${color}0A`,
          cursor: 'grab',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: color, boxShadow: `0 0 8px ${color}`,
          }} />
          <span style={{
            fontSize: 10, fontFamily: 'var(--font-mono)',
            color, letterSpacing: '0.12em', fontWeight: 500,
          }}>
            {type.toUpperCase()}
          </span>
          {data.confidence && data.confidence !== 'unknown' && (
            <span style={{
              fontSize: 8, fontFamily: 'var(--font-mono)',
              color: CONFIDENCE_COLOR[data.confidence] || 'var(--text-dim)',
              background: `${CONFIDENCE_COLOR[data.confidence]}15`,
              border: `1px solid ${CONFIDENCE_COLOR[data.confidence]}40`,
              padding: '1px 5px', borderRadius: 3, letterSpacing: '0.08em',
            }}>
              {data.confidence} conf.
            </span>
          )}
          {/* Drag hint */}
          <span style={{
            fontSize: 8, color: 'var(--text-dim)',
            fontFamily: 'var(--font-mono)', opacity: 0.5,
          }}>
            ⠿
          </span>
        </div>

        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={clearFocus}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-dim)', fontSize: 14, lineHeight: 1,
            padding: '2px 4px', borderRadius: 3, transition: 'color 0.1s',
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
              fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 500,
              color: getClassColor(data.classification),
              background: `${getClassColor(data.classification)}15`,
              border: `1px solid ${getClassColor(data.classification)}40`,
              padding: '3px 8px', borderRadius: 4,
              letterSpacing: '0.06em', textTransform: 'uppercase',
            }}>
              {data.classification}
            </span>
          </div>
        )}

        {/* Aircraft fields */}
        {type === 'aircraft' && (
          <>
            <Field label="CALLSIGN"   value={data.callsign || data.icao24} mono />
            <Field label="ICAO HEX"   value={data.icao24} mono />
            <Field label="ORIGIN"     value={data.origin_country} />
            <Field label="ALTITUDE"   value={formatAlt(data.baro_altitude)} mono />
            <Field label="SPEED"      value={formatSpeed(data.velocity)} mono />
            <Field label="HEADING"    value={data.true_track != null ? `${Math.round(data.true_track)}°` : null} mono />
            <Field label="STATUS"     value={data.on_ground ? 'On ground' : 'Airborne'} />
          </>
        )}

        {/* Vessel fields */}
        {type === 'vessel' && (
          <>
            <Field label="NAME"     value={data.name} />
            <Field label="MMSI"     value={data.mmsi} mono />
            <Field label="FLAG"     value={data.flag} />
            <Field label="SPEED"    value={formatSpeedKnots(data.speed)} mono />
            <Field label="HEADING"  value={data.heading != null ? `${Math.round(data.heading)}°` : null} mono />
          </>
        )}

        {/* Satellite fields */}
        {type === 'satellite' && (
          <>
            <Field label="NAME"      value={data.name} />
            <Field label="GROUP"     value={data.group} />
            <Field label="ALTITUDE"  value={data.altitude_km != null ? `${data.altitude_km.toFixed(0)} km` : null} mono />
            <Field label="LAT / LON" value={data.lat != null ? `${data.lat.toFixed(2)}° / ${data.lon.toFixed(2)}°` : null} mono />
          </>
        )}

        {/* Military base fields */}
        {type === 'military_base' && (
          <>
            <Field label="FACILITY NAME" value={data.name} />
            <Field label="TYPE"          value={data.type?.replace(/_/g, ' ').toUpperCase()} mono />
            <Field label="OPERATOR"      value={data.operator} />
            <Field label="COUNTRY"       value={data.country} />
            <Field label="SERVICE"       value={data.service?.replace(/_/g, ' ')} />
            {data.iata && <Field label="IATA CODE" value={data.iata} mono />}
            {data.icao && <Field label="ICAO CODE" value={data.icao} mono />}
            {data.note && <Field label="NOTE"      value={data.note} />}
            <div style={{
              marginTop: 8, padding: '6px 8px',
              background: 'rgba(255,68,68,0.06)',
              border: '1px solid rgba(255,68,68,0.15)',
              borderRadius: 4,
              fontSize: 9, fontFamily: 'var(--font-mono)',
              color: 'var(--text-dim)', lineHeight: 1.5,
            }}>
              ⚠ Source: OpenStreetMap. Coverage varies by country and region.
            </div>
          </>
        )}

        {/* Coordinates footer */}
        {data.lat != null && (
          <div style={{
            marginTop: 8, paddingTop: 8,
            borderTop: '1px solid var(--border-dim)',
            fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)',
          }}>
            {data.lat.toFixed(4)}°, {data.lon.toFixed(4)}°
          </div>
        )}
      </div>
    </div>
  )
}
