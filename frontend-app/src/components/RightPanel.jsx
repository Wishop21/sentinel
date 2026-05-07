/**
 * SENTINEL — Right panel
 * Tier 1 live metrics: global counts, 24h trends, data quality
 */

import useStore from '../store'

function MetricRow({ label, value, color, sublabel }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', letterSpacing: '0.08em' }}>
          {label}
        </span>
        {sublabel && (
          <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
            {sublabel}
          </span>
        )}
      </div>
      <div style={{ fontSize: 22, fontFamily: 'var(--font-mono)', fontWeight: 500, color: color || 'var(--text-primary)', letterSpacing: '-0.02em' }}>
        {value != null ? value.toLocaleString() : '—'}
      </div>
    </div>
  )
}

function ClassBar({ label, value, total, color }) {
  const pct = total > 0 ? (value / total) * 100 : 0
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color }}>
          {value?.toLocaleString() ?? '—'}
          <span style={{ color: 'var(--text-dim)', marginLeft: 4 }}>
            {pct > 0 ? `${pct.toFixed(1)}%` : ''}
          </span>
        </span>
      </div>
      <div style={{ height: 2, background: 'var(--border-dim)', borderRadius: 1, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: color,
          borderRadius: 1,
          transition: 'width 0.6s ease',
        }} />
      </div>
    </div>
  )
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 9, fontFamily: 'var(--font-mono)',
      color: 'var(--text-dim)', letterSpacing: '0.15em',
      marginBottom: 12, paddingLeft: 2,
    }}>
      {children}
    </div>
  )
}

function QualityIndicator({ quality }) {
  if (!quality?.length) return null

  const recent = quality.slice(0, 12)
  const missRate = recent.filter(q => !q.received).length / recent.length

  const statusColor = missRate === 0
    ? 'var(--commercial)'
    : missRate < 0.2
      ? 'var(--cargo)'
      : 'var(--military)'

  return (
    <div style={{
      padding: '10px 12px',
      background: 'rgba(0,0,0,0.2)',
      borderRadius: 'var(--radius)',
      border: '1px solid var(--border-dim)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
          DATA INTEGRITY
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: statusColor, boxShadow: `0 0 4px ${statusColor}` }} />
          <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: statusColor }}>
            {missRate === 0 ? 'NOMINAL' : missRate < 0.2 ? 'DEGRADED' : 'IMPAIRED'}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 2 }}>
        {recent.map((q, i) => (
          <div key={i} style={{
            flex: 1, height: 16, borderRadius: 2,
            background: q.received ? 'var(--commercial)' : 'var(--military)',
            opacity: q.received ? 0.7 : 0.5,
          }} />
        ))}
      </div>
      <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', marginTop: 5 }}>
        Last 12 snapshots · green = received
      </div>
    </div>
  )
}

export default function RightPanel() {
  const aircraft   = useStore(s => s.aircraft)
  const vessels    = useStore(s => s.vessels)
  const satellites = useStore(s => s.satellites)
  const metrics    = useStore(s => s.metrics)
  const quality    = useStore(s => s.dataQuality)

  // Compute live classification breakdown from current data
  const classBreakdown = (data) => {
    const counts = {}
    data.forEach(d => {
      const c = d.classification || 'unknown'
      counts[c] = (counts[c] || 0) + 1
    })
    return counts
  }

  const acCounts = classBreakdown(aircraft)
  const acTotal  = aircraft.length

  return (
    <div className="glass anim-right" style={{
      position: 'absolute',
      top: 'var(--topbar-height)',
      right: 0,
      bottom: 0,
      width: 'var(--panel-width)',
      borderTop: 'none',
      borderRight: 'none',
      borderBottom: 'none',
      padding: '16px 14px',
      overflowY: 'auto',
      zIndex: 50,
    }}>

      {/* Live counts */}
      <SectionLabel>LIVE COUNTS</SectionLabel>

      <MetricRow label="AIRCRAFT"   value={aircraft.length}   color="var(--aircraft)"  sublabel="ADS-B" />
      <MetricRow label="VESSELS"    value={vessels.length}    color="var(--vessel)"    sublabel="AIS" />
      <MetricRow label="SATELLITES" value={satellites.length} color="var(--satellite)" sublabel="TLE" />

      <div style={{ height: 1, background: 'var(--border-dim)', margin: '16px 0' }} />

      {/* Aircraft breakdown */}
      <SectionLabel>AIRCRAFT TYPES</SectionLabel>

      <ClassBar label="Commercial" value={acCounts.commercial} total={acTotal} color="var(--commercial)" />
      <ClassBar label="Military"   value={acCounts.military}   total={acTotal} color="var(--military)" />
      <ClassBar label="Cargo"      value={acCounts.cargo}      total={acTotal} color="var(--cargo)" />
      <ClassBar label="General"    value={acCounts.general}    total={acTotal} color="var(--civilian)" />
      <ClassBar label="Unknown"    value={acCounts.unknown}    total={acTotal} color="var(--text-dim)" />

      <div style={{ height: 1, background: 'var(--border-dim)', margin: '16px 0' }} />

      {/* Satellite breakdown */}
      <SectionLabel>SATELLITE TYPES</SectionLabel>
      {(() => {
        const sc = classBreakdown(satellites)
        const st = satellites.length
        return (
          <>
            <ClassBar label="Commercial"  value={sc.commercial}  total={st} color="var(--commercial)" />
            <ClassBar label="Navigation"  value={sc.navigation}  total={st} color="var(--civilian)" />
            <ClassBar label="Crewed"      value={sc.crewed}      total={st} color="var(--aircraft)" />
            <ClassBar label="Military"    value={sc.military}    total={st} color="var(--military)" />
            <ClassBar label="Civil/Sci"   value={sc.civil}       total={st} color="var(--vessel)" />
            <ClassBar label="Debris"      value={sc.debris}      total={st} color="var(--text-dim)" />
          </>
        )
      })()}

      <div style={{ height: 1, background: 'var(--border-dim)', margin: '16px 0' }} />

      {/* Data quality */}
      <SectionLabel>DATA QUALITY</SectionLabel>
      <QualityIndicator quality={quality} />

      <div style={{ height: 16 }} />

    </div>
  )
}
