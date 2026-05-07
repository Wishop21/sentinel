/**
 * SENTINEL — Left panel
 * Layer toggles, sub-filters, classification filter
 */

import { useState } from 'react'
import useStore from '../store'

const SATELLITE_GROUPS = [
  { id: null,       label: 'All satellites' },
  { id: 'oneweb',   label: 'OneWeb' },
  { id: 'stations', label: 'Stations / ISS' },
  { id: 'gps-ops',  label: 'GPS' },
  { id: 'galileo',  label: 'Galileo' },
]

const CLASSIFICATIONS = [
  { id: null,         label: 'All types',   color: 'var(--text-secondary)' },
  { id: 'military',   label: 'Military',    color: 'var(--military)' },
  { id: 'commercial', label: 'Commercial',  color: 'var(--commercial)' },
  { id: 'civilian',   label: 'Civilian',    color: 'var(--civilian)' },
  { id: 'cargo',      label: 'Cargo',       color: 'var(--cargo)' },
  { id: 'unknown',    label: 'Unknown',     color: 'var(--text-dim)' },
]

function LayerToggle({ domain, label, color, count, children }) {
  const layers       = useStore(s => s.layers)
  const toggleLayer  = useStore(s => s.toggleLayer)
  const [expanded, setExpanded] = useState(false)
  const active = layers[domain]

  return (
    <div style={{ marginBottom: 4 }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '9px 12px',
          borderRadius: 'var(--radius)',
          cursor: 'pointer',
          background: active ? `rgba(${colorToRgb(color)}, 0.06)` : 'transparent',
          border: `1px solid ${active ? `rgba(${colorToRgb(color)}, 0.25)` : 'transparent'}`,
          transition: 'all 0.15s ease',
          userSelect: 'none',
        }}
      >
        {/* Toggle dot */}
        <div
          onClick={() => toggleLayer(domain)}
          style={{
            width: 32, height: 18, borderRadius: 9,
            background: active ? color : 'var(--bg-surface)',
            border: `1px solid ${active ? color : 'var(--border-subtle)'}`,
            position: 'relative',
            transition: 'all 0.2s ease',
            flexShrink: 0,
            cursor: 'pointer',
          }}
        >
          <div style={{
            position: 'absolute',
            top: 2, left: active ? 14 : 2,
            width: 12, height: 12, borderRadius: '50%',
            background: active ? '#fff' : 'var(--text-dim)',
            transition: 'left 0.2s ease',
          }} />
        </div>

        {/* Label + count */}
        <div
          style={{ flex: 1, cursor: 'pointer' }}
          onClick={() => toggleLayer(domain)}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: active ? color : 'var(--text-secondary)', letterSpacing: '0.05em' }}>
            {label.toUpperCase()}
          </div>
          {count != null && (
            <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', marginTop: 1 }}>
              {count.toLocaleString()} live
            </div>
          )}
        </div>

        {/* Expand chevron */}
        {children && (
          <div
            onClick={() => setExpanded(e => !e)}
            style={{
              color: 'var(--text-dim)', fontSize: 10, cursor: 'pointer',
              transform: expanded ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.2s ease',
              padding: 4,
            }}
          >
            ▾
          </div>
        )}
      </div>

      {/* Sub-filters */}
      {children && expanded && (
        <div style={{ marginTop: 4, paddingLeft: 8 }} className="anim-fade">
          {children}
        </div>
      )}
    </div>
  )
}

function FilterChip({ label, active, color, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '5px 10px',
        borderRadius: 4,
        fontSize: 11,
        fontFamily: 'var(--font-mono)',
        cursor: 'pointer',
        background: active ? `rgba(${colorToRgb(color || '#6B84A3')}, 0.15)` : 'transparent',
        border: `1px solid ${active ? (color || 'var(--border-active)') : 'var(--border-dim)'}`,
        color: active ? (color || 'var(--text-primary)') : 'var(--text-dim)',
        marginBottom: 4,
        transition: 'all 0.12s ease',
        userSelect: 'none',
      }}
    >
      {label}
    </div>
  )
}

// Naive hex→rgb helper for rgba() usage
function colorToRgb(color) {
  const map = {
    'var(--aircraft)':  '245, 166, 35',
    'var(--vessel)':    '0, 212, 212',
    'var(--satellite)': '168, 85, 247',
  }
  return map[color] || '148, 163, 184'
}

export default function LeftPanel() {
  const aircraft   = useStore(s => s.aircraft)
  const vessels    = useStore(s => s.vessels)
  const satellites = useStore(s => s.satellites)
  const classFilter       = useStore(s => s.classificationFilter)
  const setClassFilter    = useStore(s => s.setClassificationFilter)
  const satGroupFilter    = useStore(s => s.satelliteGroupFilter)
  const setSatGroupFilter = useStore(s => s.setSatelliteGroupFilter)

  return (
    <div className="glass anim-left" style={{
      position: 'absolute',
      top: 'var(--topbar-height)',
      left: 0,
      bottom: 0,
      width: 'var(--panel-width)',
      borderTop: 'none',
      borderLeft: 'none',
      borderBottom: 'none',
      padding: '16px 12px',
      overflowY: 'auto',
      zIndex: 50,
      display: 'flex',
      flexDirection: 'column',
      gap: 0,
    }}>

      {/* Section: Layers */}
      <div style={{ marginBottom: 20 }}>
        <SectionLabel>LAYERS</SectionLabel>

        <LayerToggle domain="aircraft" label="Aircraft" color="var(--aircraft)" count={aircraft.length} />
        <LayerToggle domain="vessels"  label="Vessels"  color="var(--vessel)"   count={vessels.length} />
        <LayerToggle
          domain="satellites"
          label="Satellites"
          color="var(--satellite)"
          count={satellites.length}
        >
          {SATELLITE_GROUPS.map(g => (
            <FilterChip
              key={g.id ?? 'all'}
              label={g.label}
              active={satGroupFilter === g.id}
              color="var(--satellite)"
              onClick={() => setSatGroupFilter(g.id)}
            />
          ))}
        </LayerToggle>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--border-dim)', marginBottom: 16 }} />

      {/* Section: Classification filter */}
      <div>
        <SectionLabel>FILTER BY TYPE</SectionLabel>
        {CLASSIFICATIONS.map(c => (
          <FilterChip
            key={c.id ?? 'all'}
            label={c.label}
            active={classFilter === c.id}
            color={c.color}
            onClick={() => setClassFilter(c.id)}
          />
        ))}
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--border-dim)', margin: '16px 0' }} />

      {/* Section: Legend */}
      <div>
        <SectionLabel>LEGEND</SectionLabel>
        <LegendItem color="var(--aircraft)"  label="Aircraft" />
        <LegendItem color="var(--vessel)"    label="Vessel" />
        <LegendItem color="var(--satellite)" label="Satellite" />
        <div style={{ height: 8 }} />
        <LegendItem color="var(--military)"   label="Military" dot />
        <LegendItem color="var(--commercial)" label="Commercial" dot />
        <LegendItem color="var(--civilian)"   label="Civilian" dot />
        <LegendItem color="var(--cargo)"      label="Cargo" dot />
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Confidence note */}
      <div style={{
        padding: '10px 12px',
        background: 'rgba(255, 68, 68, 0.05)',
        border: '1px solid rgba(255, 68, 68, 0.15)',
        borderRadius: 'var(--radius)',
        fontSize: 10,
        fontFamily: 'var(--font-mono)',
        color: 'var(--text-dim)',
        lineHeight: 1.5,
      }}>
        ⚠ Military data incomplete by design. Many assets do not broadcast.
        Classification confidence shown per asset.
      </div>
    </div>
  )
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 9,
      fontFamily: 'var(--font-mono)',
      color: 'var(--text-dim)',
      letterSpacing: '0.15em',
      marginBottom: 10,
      paddingLeft: 2,
    }}>
      {children}
    </div>
  )
}

function LegendItem({ color, label, dot }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <div style={{
        width: dot ? 8 : 20,
        height: dot ? 8 : 3,
        borderRadius: dot ? '50%' : 2,
        background: color,
        flexShrink: 0,
      }} />
      <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
        {label}
      </span>
    </div>
  )
}
