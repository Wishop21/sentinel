import './index.css'
import Globe         from './components/Globe'
import TopBar        from './components/TopBar'
import LeftPanel     from './components/LeftPanel'
import RightPanel    from './components/RightPanel'
import AssetInfoCard from './components/AssetInfoCard'
import RegionPanel   from './components/RegionPanel'
import AlertsPanel   from './components/AlertsPanel'
import { useAllData } from './hooks/useData'

export default function App() {
  useAllData()

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: 'var(--bg-void)' }}>
      <Globe />
      <TopBar />
      <LeftPanel />
      <RightPanel />
      <AssetInfoCard />
      <RegionPanel />
      <AlertsPanel />
    </div>
  )
}
