/**
 * SENTINEL — Right Panel (Stage 3)
 * Live counts, trend indicators, country breakdown, sparklines
 * frontend-app/src/components/RightPanel.jsx
 */

import { useState, useEffect, useMemo } from 'react'
import useStore from '../store'

// ── Tiny sparkline component ─────────────────────────────────
function Sparkline({ data, color, height = 32 }) {
  if (!data || data.length < 2) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center' }}>
        <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
          accumulating data...
        </span>
      </div>
    )
  }

  const values = data.map(d => d.total || 0)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const w = 200
  const h = height

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w
    const y = h - ((v - min) / range) * (h - 4) - 2
    return `${x},${y}`
  }).join(' ')

  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity="0.8"
      />
      {/* Fill under line */}
      <polyline
        points={`0,${h} ${points} ${w},${h}`}
        fill={color}
        opacity="0.08"
      />
    </svg>
  )
}

// ── Trend indicator ──────────────────────────────────────────
function TrendBadge({ trend, pct }) {
  if (!trend || trend === 'insufficient_data') return null
  const isUp   = trend === 'up'
  const stable = trend === 'stable'
  const color  = stable ? 'var(--text-dim)' : isUp ? 'var(--commercial)' : 'var(--military)'
  const arrow  = stable ? '→' : isUp ? '↑' : '↓'
  const label  = stable ? 'stable' : `${Math.abs(pct)}%`

  return (
    <span style={{
      fontSize: 9, fontFamily: 'var(--font-mono)',
      color, marginLeft: 6,
      background: `${color}15`,
      border: `1px solid ${color}30`,
      padding: '1px 5px', borderRadius: 3,
    }}>
      {arrow} {label}
    </span>
  )
}

// ── Metric block with sparkline ──────────────────────────────
function MetricBlock({ label, value, color, sublabel, trend, sparkData }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
            {label}
          </span>
          {trend && <TrendBadge trend={trend.trend} pct={trend.pct_vs_24h} />}
        </div>
        <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
          {sublabel}
        </span>
      </div>
      <div style={{ fontSize: 22, fontFamily: 'var(--font-mono)', fontWeight: 500, color, letterSpacing: '-0.02em', marginBottom: 4 }}>
        {value != null ? value.toLocaleString() : '—'}
      </div>
      <Sparkline data={sparkData} color={color} height={28} />
    </div>
  )
}

// ── Classification bar ───────────────────────────────────────
function ClassBar({ label, value, total, color }) {
  const pct = total > 0 ? (value / total) * 100 : 0
  return (
    <div style={{ marginBottom: 7 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color }}>
          {value?.toLocaleString() ?? '—'}
          {pct > 0 && <span style={{ color: 'var(--text-dim)', marginLeft: 4 }}>{pct.toFixed(1)}%</span>}
        </span>
      </div>
      <div style={{ height: 2, background: 'var(--border-dim)', borderRadius: 1, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 1, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  )
}

// ── Country row ──────────────────────────────────────────────
function CountryRow({ rank, country, total, militaryPct, maxTotal }) {
  const barPct = maxTotal > 0 ? (total / maxTotal) * 100 : 0
  const flagColor = militaryPct > 10 ? 'var(--military)' : militaryPct > 5 ? 'var(--cargo)' : 'var(--aircraft)'

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', width: 14 }}>
            {rank}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-primary)', fontWeight: 500 }}>
            {country}
          </span>
          {militaryPct > 5 && (
            <span style={{
              fontSize: 8, fontFamily: 'var(--font-mono)',
              color: 'var(--military)',
              background: 'rgba(255,68,68,0.1)',
              border: '1px solid rgba(255,68,68,0.2)',
              padding: '0px 4px', borderRadius: 2,
            }}>
              {militaryPct}% mil
            </span>
          )}
        </div>
        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: flagColor, fontWeight: 500 }}>
          {total.toLocaleString()}
        </span>
      </div>
      <div style={{ height: 2, background: 'var(--border-dim)', borderRadius: 1, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${barPct}%`,
          background: `linear-gradient(90deg, var(--aircraft), ${flagColor})`,
          borderRadius: 1, transition: 'width 0.8s ease',
        }} />
      </div>
    </div>
  )
}

function SectionLabel({ children, action, onAction }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingLeft: 2 }}>
      <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', letterSpacing: '0.15em' }}>
        {children}
      </span>
      {action && (
        <button onClick={onAction} style={{
          fontSize: 9, fontFamily: 'var(--font-mono)',
          color: 'var(--text-dim)', background: 'none', border: 'none',
          cursor: 'pointer', padding: '2px 6px',
          borderRadius: 3, transition: 'color 0.1s',
        }}
          onMouseEnter={e => e.target.style.color = 'var(--text-secondary)'}
          onMouseLeave={e => e.target.style.color = 'var(--text-dim)'}
        >
          {action}
        </button>
      )}
    </div>
  )
}

function QualityIndicator({ quality }) {
  if (!quality?.length) return null
  const recent = quality.slice(0, 12)
  const missRate = recent.filter(q => !q.received).length / recent.length
  const statusColor = missRate === 0 ? 'var(--commercial)' : missRate < 0.2 ? 'var(--cargo)' : 'var(--military)'
  const status = missRate === 0 ? 'NOMINAL' : missRate < 0.2 ? 'DEGRADED' : 'IMPAIRED'

  return (
    <div style={{ padding: '10px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius)', border: '1px solid var(--border-dim)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
          DATA INTEGRITY
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: statusColor, boxShadow: `0 0 4px ${statusColor}` }} />
          <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: statusColor }}>{status}</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 2 }}>
        {recent.map((q, i) => (
          <div key={i} style={{ flex: 1, height: 14, borderRadius: 2, background: q.received ? 'var(--commercial)' : 'var(--military)', opacity: 0.7 }} />
        ))}
      </div>
    </div>
  )
}

// ── Domain selector tabs ─────────────────────────────────────
function DomainTabs({ value, onChange }) {
  const tabs = [
    { id: 'aircraft',  label: 'AIR',  color: 'var(--aircraft)' },
    { id: 'vessel',    label: 'SEA',  color: 'var(--vessel)' },
    { id: 'satellite', label: 'SPACE',color: 'var(--satellite)' },
  ]
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          style={{
            flex: 1, padding: '5px 0', fontSize: 9,
            fontFamily: 'var(--font-mono)', letterSpacing: '0.08em',
            background: value === t.id ? `${t.color}18` : 'transparent',
            border: `1px solid ${value === t.id ? t.color : 'var(--border-dim)'}`,
            color: value === t.id ? t.color : 'var(--text-dim)',
            borderRadius: 4, cursor: 'pointer', transition: 'all 0.15s',
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ── Main component ───────────────────────────────────────────
export default function RightPanel() {
  const aircraft   = useStore(s => s.aircraft)
  const vessels    = useStore(s => s.vessels)
  const satellites = useStore(s => s.satellites)
  const quality    = useStore(s => s.dataQuality)

  const [countryDomain, setCountryDomain] = useState('aircraft')
  const [countries, setCountries]         = useState([])
  const [trends, setTrends]               = useState({})
  const [sparklines, setSparklines]       = useState({})
  const [loadingCountries, setLoadingCountries] = useState(false)

  // Fetch country breakdown
  useEffect(() => {
    const fetchCountries = async () => {
      setLoadingCountries(true)
      try {
        const r = await fetch(`/api/analytics/countries?domain=${countryDomain}&limit=12&hours=1`)
        const d = await r.json()
        setCountries(d.data || [])
      } catch (e) {
        console.warn('Country fetch failed:', e)
      }
      setLoadingCountries(false)
    }
    fetchCountries()
    const id = setInterval(fetchCountries, 60000)
    return () => clearInterval(id)
  }, [countryDomain])

  // Fetch trend summary and sparklines
  useEffect(() => {
    const fetchTrends = async () => {
      try {
        const [summary, acSpark, vSpark] = await Promise.all([
          fetch('/api/analytics/summary').then(r => r.json()),
          fetch('/api/analytics/trends?domain=aircraft&hours=24').then(r => r.json()),
          fetch('/api/analytics/trends?domain=vessel&hours=24').then(r => r.json()),
        ])
        setTrends(summary)
        setSparklines({
          aircraft: acSpark.data || [],
          vessel:   vSpark.data  || [],
        })
      } catch (e) {
        console.warn('Trends fetch failed:', e)
      }
    }
    fetchTrends()
    const id = setInterval(fetchTrends, 120000)
    return () => clearInterval(id)
  }, [])

  // Live classification breakdown
  const classBreakdown = (data) => {
    const counts = {}
    data.forEach(d => { const c = d.classification || 'unknown'; counts[c] = (counts[c] || 0) + 1 })
    return counts
  }

  const acCounts  = useMemo(() => classBreakdown(aircraft),  [aircraft])
  const satCounts = useMemo(() => classBreakdown(satellites), [satellites])
  const maxCountryTotal = countries.length > 0 ? countries[0].total : 1

  const domainColor = {
    aircraft:  'var(--aircraft)',
    vessel:    'var(--vessel)',
    satellite: 'var(--satellite)',
  }

  return (
    <div className="glass anim-right" style={{
      position: 'absolute', top: 'var(--topbar-height)', right: 0, bottom: 0,
      width: 'var(--panel-width)', borderTop: 'none', borderRight: 'none', borderBottom: 'none',
      padding: '16px 14px', overflowY: 'auto', zIndex: 50,
    }}>

      {/* ── Live counts with sparklines ── */}
      <SectionLabel>LIVE TRAFFIC</SectionLabel>

      <MetricBlock
        label="AIRCRAFT" sublabel="ADS-B"
        value={aircraft.length}
        color="var(--aircraft)"
        trend={trends.aircraft}
        sparkData={sparklines.aircraft}
      />
      <MetricBlock
        label="VESSELS" sublabel="AIS"
        value={vessels.length}
        color="var(--vessel)"
        trend={trends.vessel}
        sparkData={sparklines.vessel}
      />
      <MetricBlock
        label="SATELLITES" sublabel="TLE"
        value={satellites.length}
        color="var(--satellite)"
        sparkData={[]}
      />

      <div style={{ height: 1, background: 'var(--border-dim)', margin: '14px 0' }} />

      {/* ── Country breakdown ── */}
      <SectionLabel>TOP REGIONS</SectionLabel>
      <DomainTabs value={countryDomain} onChange={setCountryDomain} />

      {loadingCountries && countries.length === 0 ? (
        <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', padding: '8px 0' }}>
          loading...
        </div>
      ) : countries.length === 0 ? (
        <div style={{
          fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)',
          padding: '10px 12px', background: 'rgba(0,0,0,0.2)',
          borderRadius: 'var(--radius)', border: '1px solid var(--border-dim)',
          lineHeight: 1.5,
        }}>
          Country data accumulates over time. Check back in a few minutes.
        </div>
      ) : (
        countries.map((c, i) => (
          <CountryRow
            key={c.country}
            rank={i + 1}
            country={c.country}
            total={c.total}
            militaryPct={c.military_pct}
            maxTotal={maxCountryTotal}
          />
        ))
      )}

      <div style={{ height: 1, background: 'var(--border-dim)', margin: '14px 0' }} />

      {/* ── Aircraft classification ── */}
      <SectionLabel>AIRCRAFT TYPES</SectionLabel>
      <ClassBar label="Commercial" value={acCounts.commercial} total={aircraft.length} color="var(--commercial)" />
      <ClassBar label="Military"   value={acCounts.military}   total={aircraft.length} color="var(--military)" />
      <ClassBar label="Cargo"      value={acCounts.cargo}      total={aircraft.length} color="var(--cargo)" />
      <ClassBar label="General"    value={acCounts.general}    total={aircraft.length} color="var(--civilian)" />
      <ClassBar label="Unknown"    value={acCounts.unknown}    total={aircraft.length} color="var(--text-dim)" />

      <div style={{ height: 1, background: 'var(--border-dim)', margin: '14px 0' }} />

      {/* ── Satellite types ── */}
      <SectionLabel>SATELLITE TYPES</SectionLabel>
      {['commercial','navigation','crewed','military','civil','debris'].map(cls => (
        <ClassBar
          key={cls}
          label={cls.charAt(0).toUpperCase() + cls.slice(1)}
          value={satCounts[cls]}
          total={satellites.length}
          color={cls === 'military' ? 'var(--military)' : cls === 'crewed' ? 'var(--aircraft)' : cls === 'navigation' ? 'var(--civilian)' : cls === 'commercial' ? 'var(--commercial)' : 'var(--text-dim)'}
        />
      ))}

      <div style={{ height: 1, background: 'var(--border-dim)', margin: '14px 0' }} />

      {/* ── Data quality ── */}
      <SectionLabel>DATA QUALITY</SectionLabel>
      <QualityIndicator quality={quality} />

      <div style={{ height: 16 }} />
    </div>
  )
}
