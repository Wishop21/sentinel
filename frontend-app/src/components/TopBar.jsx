/**
 * SENTINEL — Top bar
 * Logo, live clock, connection status
 */

import { useState, useEffect } from 'react'
import useStore from '../store'

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

function StatusDot({ label, count, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div style={{
        width: 6, height: 6, borderRadius: '50%',
        background: color,
        boxShadow: `0 0 6px ${color}`,
      }} />
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
    </div>
  )
}

export default function TopBar() {
  const aircraft   = useStore(s => s.aircraft)
  const vessels    = useStore(s => s.vessels)
  const satellites = useStore(s => s.satellites)

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

      {/* Live asset counts */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <StatusDot label="aircraft"   count={aircraft.length}   color="var(--aircraft)" />
        <StatusDot label="vessels"    count={vessels.length}    color="var(--vessel)" />
        <StatusDot label="satellites" count={satellites.length} color="var(--satellite)" />
      </div>

      {/* Clock */}
      <LiveClock />

    </div>
  )
}
