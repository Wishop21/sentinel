/**
 * SENTINEL — Region analytics panel
 * Appears when the user clicks empty globe space.
 * Shows asset counts, classification breakdown, and 24h trend
 * for the selected H3 cell.
 * frontend-app/src/components/RegionPanel.jsx
 */

import useStore from '../store'

const DOMAIN_COLOR = {
  aircraft:   'var(--aircraft)',
  vessels:    'var(--vessel)',
  satellites: 'var(--satellite)',
}

const DOMAIN_LABEL = {
  aircraft:   'Aircraft',
  vessels:    'Vessels',
  satellites: 'Satellites',
}

const CLS_COLOR = {
  military:   'var(--military)',
  commercial: 'var(--commercial)',
  civilian:   'var(--civilian)',
  cargo:      'var(--cargo)',
  navigation: 'var(--civilian)',
  crewed:     'var(--aircraft)',
  civil:      'var(--civilian)',
  debris:     'var(--text-dim)',
  unknown:    'var(--text-dim)',
}

const TREND_ICON = {
  up:                 '↑',
  down:               '↓',
  stable:             '→',
  insufficient_data:  '—',
}

const TREND_COLOR = {
  up:                'var(--commercial)',
  down:              'var(--military)',
  stable:            'var(--text-secondary)',
  insufficient_data: 'var(--text-dim)',
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 9, fontFamily: 'var(--font-mono)',
      color: 'var(--text-dim)', letterSpacing: '0.15em',
      marginBottom: 8, marginTop: 12,
    }}>
      {children}
    </div>
  )
}

function DomainRow({ domain, data, trend }) {
  const color = DOMAIN_COLOR[domain] || 'var(--text-secondary)'
  const trendData = trend?.[domain]
  const direction = trendData?.direction || 'insufficient_data'

  return (
    <div style={{
      marginBottom: 10,
      padding: '8px 10px',
      background: `rgba(255,255,255,0.02)`,
      border: `1px solid rgba(255,255,255,0.05)`,
      borderRadius: 'var(--radius)',
    }}>
      {/* Domain header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color, fontWeight: 600, letterSpacing: '0.05em' }}>
            {DOMAIN_LABEL[domain] || domain}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Trend indicator */}
          <span style={{
            fontSize: 11, fontFamily: 'var(--font-mono)',
            color: TREND_COLOR[direction],
          }}>
            {TREND_ICON[direction]}
            {trendData?.pct_change != null && direction !== 'insufficient_data'
              ? ` ${Math.abs(trendData.pct_change)}%`
              : ''
            }
          </span>
          {/* Total count */}
          <span style={{
            fontSize: 13, fontFamily: 'var(--font-mono)',
            color: 'var(--text-primary)', fontWeight: 500,
          }}>
            {data.unique_assets ?? data.total ?? 0}
          </span>
          <span style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
            unique
          </span>
        </div>
      </div>

      {/* Classification breakdown */}
      {data.classifications && Object.keys(data.classifications).length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {Object.entries(data.classifications)
            .sort(([, a], [, b]) => b - a)
            .map(([cls, count]) => (
              <span key={cls} style={{
                fontSize: 9, fontFamily: 'var(--font-mono)',
                color: CLS_COLOR[cls] || 'var(--text-dim)',
                background: `${CLS_COLOR[cls] || 'var(--text-dim)'}15`,
                border: `1px solid ${CLS_COLOR[cls] || 'var(--text-dim)'}30`,
                padding: '2px 6px', borderRadius: 3,
              }}>
                {cls} {count}
              </span>
            ))
          }
        </div>
      )}

      {data.total === 0 && (
        <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
          No observations in window
        </div>
      )}
    </div>
  )
}

export default function RegionPanel() {
  const selectedRegion = useStore(s => s.selectedRegion)
  const clearRegion    = useStore(s => s.clearRegion)

  if (!selectedRegion) return null

  const { loading, h3Index, center, stats, error } = selectedRegion

  return (
    <div className="anim-fade" style={{
      position: 'absolute',
      top: 'calc(var(--topbar-height) + 16px)',
      right: 'calc(var(--panel-width) + 16px)',
      width: 280,
      maxHeight: 'calc(100vh - var(--topbar-height) - 32px)',
      overflowY: 'auto',
      zIndex: 60,
      background: 'var(--bg-card)',
      border: '1px solid rgba(0, 212, 180, 0.25)',
      borderRadius: 'var(--radius-lg)',
      backdropFilter: 'blur(20px)',
      boxShadow: '0 0 40px rgba(0,212,180,0.08), 0 8px 32px rgba(0,0,0,0.6)',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px',
        borderBottom: '1px solid rgba(0,212,180,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(0,212,180,0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: 'rgb(0,212,180)',
            boxShadow: '0 0 8px rgb(0,212,180)',
          }} />
          <span style={{
            fontSize: 10, fontFamily: 'var(--font-mono)',
            color: 'rgb(0,212,180)', letterSpacing: '0.12em', fontWeight: 500,
          }}>
            REGION ANALYSIS
          </span>
        </div>
        <button
          onClick={clearRegion}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-dim)', fontSize: 14, lineHeight: 1,
            padding: '2px 4px', borderRadius: 3,
          }}
          onMouseEnter={e => e.target.style.color = 'var(--text-primary)'}
          onMouseLeave={e => e.target.style.color = 'var(--text-dim)'}
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: '12px 14px' }}>

        {/* Cell identifier */}
        {h3Index && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', marginBottom: 2, letterSpacing: '0.1em' }}>
              H3 CELL
            </div>
            <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
              {h3Index}
            </div>
          </div>
        )}

        {/* Center coordinates */}
        {center && (
          <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', marginBottom: 4 }}>
            {center.lat?.toFixed(2)}°, {center.lon?.toFixed(2)}°
            &nbsp;·&nbsp;Res 3&nbsp;·&nbsp;~12,100 km²
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div style={{
            padding: '20px 0', textAlign: 'center',
            fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)',
          }}>
            <div style={{ marginBottom: 8, fontSize: 18 }}>⟳</div>
            Querying 24h snapshots...
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div style={{
            padding: '10px', marginTop: 8,
            background: 'rgba(255,68,68,0.06)',
            border: '1px solid rgba(255,68,68,0.2)',
            borderRadius: 'var(--radius)',
            fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)',
          }}>
            ⚠ Query failed: {error}
          </div>
        )}

        {/* Results */}
        {stats && !loading && (
          <>
            {/* Total summary */}
            <div style={{
              padding: '8px 10px', marginBottom: 4,
              background: 'rgba(0,212,180,0.04)',
              border: '1px solid rgba(0,212,180,0.1)',
              borderRadius: 'var(--radius)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
                TOTAL UNIQUE ASSETS
              </span>
              <span style={{ fontSize: 16, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 600 }}>
                {stats.total_unique_assets ?? 0}
              </span>
            </div>

            <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', marginBottom: 8 }}>
              Last {stats.hours}h · arrows show first↔second half trend
            </div>

            <SectionLabel>BY DOMAIN</SectionLabel>
            {['aircraft', 'vessels', 'satellites'].map(domain => (
              <DomainRow
                key={domain}
                domain={domain}
                data={stats.domains?.[domain] || { total: 0, unique_assets: 0, classifications: {} }}
                trend={stats.trend}
              />
            ))}

            {/* Data honesty note */}
            <div style={{
              marginTop: 10, padding: '6px 8px',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--border-dim)',
              borderRadius: 'var(--radius)',
              fontSize: 9, fontFamily: 'var(--font-mono)',
              color: 'var(--text-dim)', lineHeight: 1.5,
            }}>
              ⓘ {stats.data_note}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
