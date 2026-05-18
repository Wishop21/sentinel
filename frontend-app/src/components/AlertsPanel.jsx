/**
 * SENTINEL — Alerts panel
 * Shows current anomaly flags and military proximity alerts.
 * Dismissable per-alert and as a whole.
 * frontend-app/src/components/AlertsPanel.jsx
 */

import { useState } from 'react'
import useStore from '../store'

const SEVERITY_COLOR = {
  high:   'var(--military)',
  medium: 'var(--aircraft)',
  low:    'var(--text-secondary)',
}

const SEVERITY_BG = {
  high:   'rgba(255,68,68,0.06)',
  medium: 'rgba(245,166,35,0.06)',
  low:    'rgba(107,132,163,0.04)',
}

const TYPE_ICON = {
  anomaly:   '⚡',
  proximity: '⊕',
}

const DOMAIN_COLOR = {
  aircraft:  'var(--aircraft)',
  vessel:    'var(--vessel)',
  satellite: 'var(--satellite)',
}

const CONFIDENCE_LABEL = {
  high:    'HIGH CONF',
  medium:  'MED CONF',
  low:     'LOW CONF',
  unknown: 'UNKNOWN',
}

function AlertRow({ alert, onDismiss, onClick }) {
  const sevColor = SEVERITY_COLOR[alert.severity] || 'var(--text-dim)'
  const sevBg    = SEVERITY_BG[alert.severity]    || 'transparent'

  return (
    <div
      style={{
        marginBottom: 6,
        padding: '8px 10px',
        background: sevBg,
        border: `1px solid ${sevColor}30`,
        borderLeft: `2px solid ${sevColor}`,
        borderRadius: 'var(--radius)',
        cursor: 'pointer',
        transition: 'border-color 0.15s',
      }}
      onClick={() => onClick(alert)}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* Type + severity header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 10 }}>{TYPE_ICON[alert.type]}</span>
            <span style={{
              fontSize: 8, fontFamily: 'var(--font-mono)',
              color: sevColor, letterSpacing: '0.1em', fontWeight: 600,
            }}>
              {alert.severity.toUpperCase()}
            </span>
            <span style={{
              fontSize: 8, fontFamily: 'var(--font-mono)',
              color: 'var(--text-dim)', letterSpacing: '0.06em',
            }}>
              {CONFIDENCE_LABEL[alert.confidence] || ''}
            </span>
          </div>

          {/* Label */}
          <div style={{
            fontSize: 11, fontFamily: 'var(--font-mono)',
            color: 'var(--text-primary)', fontWeight: 500,
            marginBottom: 3, whiteSpace: 'nowrap',
            overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {alert.label}
          </div>

          {/* Detail */}
          <div style={{
            fontSize: 10, fontFamily: 'var(--font-mono)',
            color: 'var(--text-secondary)', lineHeight: 1.4,
          }}>
            {alert.detail}
          </div>

        </div>

        {/* Dismiss button */}
        <button
          onClick={e => { e.stopPropagation(); onDismiss(alert.id) }}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-dim)', fontSize: 12, lineHeight: 1,
            padding: '0 2px', flexShrink: 0,
            transition: 'color 0.1s',
          }}
          onMouseEnter={e => e.target.style.color = 'var(--text-primary)'}
          onMouseLeave={e => e.target.style.color = 'var(--text-dim)'}
        >
          ✕
        </button>
      </div>
    </div>
  )
}

export default function AlertsPanel() {
  const alerts         = useStore(s => s.alerts)
  const setFocusedAsset = useStore(s => s.setFocusedAsset)
  const [dismissed, setDismissed]   = useState(new Set())
  const [collapsed, setCollapsed]   = useState(false)
  const [showAll, setShowAll]       = useState(false)

  // Filter out dismissed alerts
  const visible = alerts.filter(a => !dismissed.has(a.id))

  if (!visible.length) return null

  const PREVIEW_COUNT = 5
  const displayed = showAll ? visible : visible.slice(0, PREVIEW_COUNT)
  const hiddenCount = visible.length - PREVIEW_COUNT

  const dismissOne = (id) => setDismissed(prev => new Set([...prev, id]))
  const dismissAll = () => setDismissed(new Set(alerts.map(a => a.id)))

  const handleAlertClick = (alert) => {
    // Focus the globe on the alert's asset
    if (alert.asset && alert.lat != null && alert.lon != null) {
      setFocusedAsset({
        id:      alert.asset.icao24 || alert.asset.mmsi || alert.asset.name,
        type:    alert.domain === 'vessel' ? 'vessel' : alert.domain === 'satellite' ? 'satellite' : 'aircraft',
        data:    alert.asset,
        screenX: window.innerWidth / 2,
        screenY: window.innerHeight / 2,
      })
    }
  }

  const highCount   = visible.filter(a => a.severity === 'high').length
  const medCount    = visible.filter(a => a.severity === 'medium').length

  return (
    <div className="anim-fade" style={{
      position: 'absolute',
      bottom: 60,
      left: 'calc(var(--panel-width) + 16px)',
      width: 300,
      maxHeight: 420,
      zIndex: 60,
      background: 'var(--bg-card)',
      border: '1px solid rgba(255,68,68,0.2)',
      borderRadius: 'var(--radius-lg)',
      backdropFilter: 'blur(20px)',
      boxShadow: '0 0 40px rgba(255,68,68,0.06), 0 8px 32px rgba(0,0,0,0.6)',
      display: 'flex',
      flexDirection: 'column',
    }}>

      {/* Header */}
      <div style={{
        padding: '10px 14px',
        borderBottom: collapsed ? 'none' : '1px solid rgba(255,68,68,0.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(255,68,68,0.04)',
        borderRadius: collapsed ? 'var(--radius-lg)' : 'var(--radius-lg) var(--radius-lg) 0 0',
        cursor: 'pointer',
        flexShrink: 0,
      }}
        onClick={() => setCollapsed(c => !c)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12 }}>⚡</span>
          <span style={{
            fontSize: 10, fontFamily: 'var(--font-mono)',
            color: 'var(--military)', letterSpacing: '0.12em', fontWeight: 500,
          }}>
            ALERTS
          </span>

          {/* Severity summary badges */}
          <div style={{ display: 'flex', gap: 4 }}>
            {highCount > 0 && (
              <span style={{
                fontSize: 8, fontFamily: 'var(--font-mono)',
                color: 'var(--military)',
                background: 'rgba(255,68,68,0.15)',
                border: '1px solid rgba(255,68,68,0.3)',
                padding: '1px 5px', borderRadius: 3,
              }}>
                {highCount} HIGH
              </span>
            )}
            {medCount > 0 && (
              <span style={{
                fontSize: 8, fontFamily: 'var(--font-mono)',
                color: 'var(--aircraft)',
                background: 'rgba(245,166,35,0.12)',
                border: '1px solid rgba(245,166,35,0.25)',
                padding: '1px 5px', borderRadius: 3,
              }}>
                {medCount} MED
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={e => { e.stopPropagation(); dismissAll() }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 9, fontFamily: 'var(--font-mono)',
              color: 'var(--text-dim)', letterSpacing: '0.06em',
              padding: '2px 4px',
            }}
            onMouseEnter={e => e.target.style.color = 'var(--text-primary)'}
            onMouseLeave={e => e.target.style.color = 'var(--text-dim)'}
          >
            CLEAR ALL
          </button>
          <span style={{
            fontSize: 10, color: 'var(--text-dim)',
            transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease', display: 'inline-block',
          }}>
            ▾
          </span>
        </div>
      </div>

      {/* Alert list */}
      {!collapsed && (
        <div style={{ overflowY: 'auto', padding: '10px 12px', flex: 1 }}>

          {displayed.map(alert => (
            <AlertRow
              key={alert.id}
              alert={alert}
              onDismiss={dismissOne}
              onClick={handleAlertClick}
            />
          ))}

          {/* Show more / less toggle */}
          {visible.length > PREVIEW_COUNT && (
            <button
              onClick={() => setShowAll(s => !s)}
              style={{
                width: '100%', background: 'none',
                border: '1px solid var(--border-dim)',
                borderRadius: 'var(--radius)',
                padding: '5px', cursor: 'pointer',
                fontSize: 10, fontFamily: 'var(--font-mono)',
                color: 'var(--text-dim)', marginTop: 2,
                transition: 'color 0.1s',
              }}
              onMouseEnter={e => e.target.style.color = 'var(--text-primary)'}
              onMouseLeave={e => e.target.style.color = 'var(--text-dim)'}
            >
              {showAll ? '▲ Show less' : `▼ Show ${hiddenCount} more`}
            </button>
          )}

          {/* Data honesty note */}
          <div style={{
            marginTop: 8, padding: '5px 8px',
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid var(--border-dim)',
            borderRadius: 'var(--radius)',
            fontSize: 9, fontFamily: 'var(--font-mono)',
            color: 'var(--text-dim)', lineHeight: 1.5,
          }}>
            ⓘ Rule-based flags only. Low-confidence alerts may reflect
            ADS-B/AIS data noise. Click alert to focus asset on globe.
          </div>
        </div>
      )}
    </div>
  )
}
