/**
 * SENTINEL — Left panel
 * Layer toggles, sub-filters, classification filter
 * frontend-app/src/components/LeftPanel.jsx
 */

import { useState } from 'react'
import useStore from '../store'

const SATELLITE_GROUPS = [
  { id: null,         label: 'All satellites' },
  { id: 'starlink',   label: 'Starlink' },
  { id: 'oneweb',     label: 'OneWeb' },
  { id: 'stations',   label: 'Stations / ISS' },
  { id: 'gps-ops',    label: 'GPS' },
  { id: 'glonass-ops',label: 'GLONASS' },
  { id: 'galileo',    label: 'Galileo' },
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
    'var(--aircraft)':       '245, 166, 35',
    'var(--vessel)':         '0, 212, 212',
    'var(--satellite)':      '168, 85, 247',
    'var(--text-secondary)': '107, 132, 163',
    'var(--military)':       '255, 68, 68',
    '#FF8C00':               '255, 140, 0',
    '#00A0DC':               '0, 160, 220',
    '#CC4444':               '204, 68, 68',
    '#FF2222':               '255, 34, 34',
    '#AA6622':               '170, 102, 34',
    '#00FFD4':               '0, 255, 212',
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
  const militaryBases     = useStore(s => s.militaryBases)
  const cables            = useStore(s => s.cables)
  const heatmapDomain     = useStore(s => s.heatmapDomain)
  const setHeatmapDomain  = useStore(s => s.setHeatmapDomain)

  const milAllCount      = militaryBases.length
  const milAirfieldCount = militaryBases.filter(b => b.type === 'airfield').length
  const milNavalCount    = militaryBases.filter(b => b.type === 'naval_base' || b.type === 'harbour').length
  const milBaseCount     = militaryBases.filter(b => b.type === 'base').length
  const milBarracksCount = militaryBases.filter(b => b.type === 'barracks').length
  const milMissileCount  = militaryBases.filter(b => b.type === 'missile_site').length
  const milTrainingCount = militaryBases.filter(b => b.type === 'training_area' || b.type === 'range').length

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
        <LayerToggle domain="borders" label="Borders"         color="var(--text-secondary)" />
        <LayerToggle domain="cables"  label="Undersea Cables" color="#00FFD4"               count={cables.length || null} />
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--border-dim)', marginBottom: 16 }} />

      {/* Section: Military Infrastructure */}
      <div style={{ marginBottom: 20 }}>
        <SectionLabel>MILITARY INFRASTRUCTURE</SectionLabel>
        <div style={{
          fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)',
          marginBottom: 10, lineHeight: 1.5,
        }}>
          OSM data — loads on first enable. Coverage varies.
        </div>

        <LayerToggle domain="mil_airfields" label="Airfields"      color="#FF8C00" count={milAirfieldCount || null} />
        <LayerToggle domain="mil_naval"     label="Naval Bases"    color="#00A0DC" count={milNavalCount    || null} />
        <LayerToggle domain="mil_bases"     label="Ground Bases"   color="var(--military)" count={milBaseCount || null} />
        <LayerToggle domain="mil_barracks"  label="Barracks"       color="#CC4444" count={milBarracksCount || null} />
        <LayerToggle domain="mil_missiles"  label="Missile Sites"  color="#FF2222" count={milMissileCount  || null} />
        <LayerToggle domain="mil_training"  label="Training Areas" color="#AA6622" count={milTrainingCount || null} />
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--border-dim)', margin: '16px 0' }} />

      {/* Section: Analytics */}
      <div style={{ marginBottom: 20 }}>
        <SectionLabel>ANALYTICS</SectionLabel>
        <div style={{
          fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)',
          marginBottom: 10, lineHeight: 1.5,
        }}>
          Density heatmap — live asset concentration by H3 cell.
        </div>

        {/* Heatmap domain selector */}
        {[
          { id: 'aircraft',   label: 'Aircraft Density',   color: 'var(--aircraft)' },
          { id: 'vessels',    label: 'Vessel Density',     color: 'var(--vessel)' },
          { id: 'satellites', label: 'Satellite Density',  color: 'var(--satellite)' },
        ].map(opt => (
          <FilterChip
            key={opt.id}
            label={opt.label}
            active={heatmapDomain === opt.id}
            color={opt.color}
            onClick={() => setHeatmapDomain(heatmapDomain === opt.id ? null : opt.id)}
          />
        ))}

        {heatmapDomain && (
          <div style={{
            marginTop: 6, padding: '5px 8px',
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid var(--border-dim)',
            borderRadius: 'var(--radius)',
            fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', lineHeight: 1.5,
          }}>
            Scale relative to current max cell. Click again to disable.
          </div>
        )}
      </div>

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
