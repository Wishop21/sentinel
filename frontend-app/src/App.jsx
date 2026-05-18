/**
 * SENTINEL — App root
 * frontend-app/src/App.jsx
 */

import './index.css'
import Globe         from './components/Globe'
import TopBar        from './components/TopBar'
import LeftPanel     from './components/LeftPanel'
import RightPanel    from './components/RightPanel'
import AssetInfoCard from './components/AssetInfoCard'
import RegionPanel   from './components/RegionPanel'
import { useAllData } from './hooks/useData'

export default function App() {
  // Start all data polling
  useAllData()

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: 'var(--bg-void)' }}>

      {/* Globe fills the entire viewport */}
      <Globe />

      {/* UI chrome layered on top */}
      <TopBar />
      <LeftPanel />
      <RightPanel />

      {/* Click-to-focus asset info card */}
      <AssetInfoCard />

      {/* Click-to-select region analytics panel */}
      <RegionPanel />

    </div>
  )
}
