/**
 * SENTINEL — Top bar
 * Logo, live clock, per-domain feed health indicators
 * frontend-app/src/components/TopBar.jsx
 */

import { useState, useEffect } from 'react'
import useStore from '../store'

// Poll intervals in ms — used to determine staleness thresholds.
// Green  : last update within 2× poll interval (briefly missed one cycle)
// Amber  : last update within 2 minutes (multiple missed cycles)
// Red    : never received, or more than 2 minutes ago
const POLL_INTERVALS = {
  aircraft:   15000,
  vessels:    20000,
  satellites: 10000,
}

const STALE_AMBER_MS = 120000  // 2 minutes
const STALE_RED_MS   = 120000  // same threshold — amber shades to red at 2min+

function useTick(ms = 5000) {
  // Re-renders consumers every `ms` so "last seen X ago" text stays fresh
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), ms)
    return () => clearInterval(id)
  }, [ms])
}

function formatAgo(lastUpdated) {
  if (!lastUpdated) return 'never'
  const diffMs = Date.now() - lastUpdated
  const diffS  = Math.floor(diffMs / 1000)
  if (diffS < 60)  return `${diffS}s ago`
  const diffM = Math.floor(diffS / 60)
  if (diffM < 60)  return `${diffM}m ago`
  return `${Math.floor(diffM / 60)}h ago`
}

function feedHealth(domain, status) {
  // Returns 'green' | 'amber' | 'red'
  if (!status || !status.ok || !status.lastUpdated) return 'red'
  const age = Date.now() - status.lastUpdated
  const grace = (POLL_INTERVALS[domain] || 15000) * 2
  if (age < grace)         return 'green'
  if (age < STALE_AMBER_MS) return 'amber'
  return 'red'
}

const HEALTH_COLOR = {
  green: '#22c55e',
  amber: '#f59e0b',
  red:   '#ef4444',
}

function LiveClock() {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const hh = String(time.getUTCHours()).padStart(2, '0')
  const mm = String(time.getUTCMinutes()).padStart(2, '0')
  const ss = String(time.getUTCSeconds()).padStart(2, '0')
  const dateStr = time.toUTCString().slice(0, 16)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '13px',
        color: 'var(--text-secondary)',
        letterSpacing: '0.02em',
      }}>
        {dateStr}
      </span>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '15px',
        color: 'var(--text-primary)',
        letterSpacing: '0.08em',
        fontWeight: 500,
      }}>
        {hh}:{mm}:{ss}
      </span>
      <span style={{
        fontSize: '10px',
        color: 'var(--text-dim)',
        letterSpacing: '0.1em',
        fontFamily: 'var(--font-mono)',
      }}>
        UTC
      </span>
    </div>
  )
}

function StatusDot({ domain, label, count, color, status }) {
  const [hovered, setHovered] = useState(false)
  useTick(5000)  // refresh "X ago" text every 5s

  const health      = feedHealth(domain, status)
  const healthColor = HEALTH_COLOR[health]
  const ago         = formatAgo(status?.lastUpdated)

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: '6px', position: 'relative' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Domain colour dot */}
      <div style={{
        width: 6, height: 6, borderRadius: '50%',
        background: color,
        boxShadow: `0 0 6px ${color}`,
      }} />

      {/* Asset count + label */}
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '11px',
        color: 'var(--text-secondary)',
      }}>
        {count != null
          ? <><span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{count.toLocaleString()}</span> {label}</>
          : label
        }
      </span>

      {/* Feed health indicator — small ring to the right of the label */}
      <div style={{
        width: 5, height: 5, borderRadius: '50%',
        background: healthColor,
        boxShadow: health === 'green' ? `0 0 4px ${healthColor}` : 'none',
        opacity: 0.85,
        transition: 'background 0.3s ease',
      }} />

      {/* Hover tooltip — shows feed health detail */}
      {hovered && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          marginTop: 8,
          padding: '6px 10px',
          background: 'var(--bg-card)',
          border: `1px solid ${healthColor}40`,
          borderRadius: 'var(--radius)',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          whiteSpace: 'nowrap',
          zIndex: 200,
          pointerEvents: 'none',
        }}>
          <div style={{
            fontSize: 9, fontFamily: 'var(--font-mono)',
            color: healthColor, letterSpacing: '0.1em', marginBottom: 3,
          }}>
            {health.toUpperCase()}
          </div>
          <div style={{
            fontSize: 10, fontFamily: 'var(--font-mono)',
            color: 'var(--text-secondary)',
          }}>
            Last update: {ago}
          </div>
          {health !== 'green' && (
            <div style={{
              fontSize: 9, fontFamily: 'var(--font-mono)',
              color: 'var(--text-dim)', marginTop: 2,
            }}>
              {health === 'red' && !status?.lastUpdated
                ? 'Feed not yet received'
                : 'Feed may be degraded'
              }
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function TopBar() {
  const aircraft        = useStore(s => s.aircraft)
  const vessels         = useStore(s => s.vessels)
  const satellites      = useStore(s => s.satellites)
  const dataSourceStatus = useStore(s => s.dataSourceStatus)

  return (
    <div className="glass" style={{
      position: 'absolute',
      top: 0, left: 0, right: 0,
      height: 'var(--topbar-height)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 20px',
      borderTop: 'none',
      borderLeft: 'none',
      borderRight: 'none',
      borderBottom: '1px solid var(--border-dim)',
      zIndex: 100,
    }}>

      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: 28, height: 28,
          borderRadius: '50%',
          border: '1.5px solid var(--vessel)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 10px var(--vessel-glow)',
        }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: 'var(--vessel)',
          }} />
        </div>
        <span style={{
          fontFamily: 'var(--font-display)',
          fontSize: '15px',
          fontWeight: 700,
          letterSpacing: '0.2em',
          color: 'var(--text-primary)',
        }}>
          SENTINEL
        </span>
        <span style={{
          fontSize: '10px',
          color: 'var(--text-dim)',
          fontFamily: 'var(--font-mono)',
          letterSpacing: '0.1em',
          marginLeft: 4,
        }}>
          v0.1
        </span>
      </div>

      {/* Live asset counts with feed health */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <StatusDot
          domain="aircraft"
          label="aircraft"
          count={aircraft.length}
          color="var(--aircraft)"
          status={dataSourceStatus?.aircraft}
        />
        <StatusDot
          domain="vessels"
          label="vessels"
          count={vessels.length}
          color="var(--vessel)"
          status={dataSourceStatus?.vessels}
        />
        <StatusDot
          domain="satellites"
          label="satellites"
          count={satellites.length}
          color="var(--satellite)"
          status={dataSourceStatus?.satellites}
        />
      </div>

      {/* Clock */}
      <LiveClock />

    </div>
  )
}
